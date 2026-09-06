// Backfill переводов событий (промпт R, п. 2.2): находит активные события
// с русским оригиналом (source_lang='ru' ИЛИ кириллица в title) и пустыми
// title_en/description_en, переводит title и description через Edge Function
// translate (публичный вызов с anon-ключом — как фронтенд src/lib/translate.ts)
// и обновляет поля через service role. Возобновляемый: повторный запуск
// добивает оставшиеся. Лимит за запуск — LIMIT (env, по умолчанию 120),
// пауза между запросами — 400 мс.
//
// Запуск: source .env (SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE,
// VITE_SUPABASE_ANON_KEY) && node scripts/backfill-translations.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 120); // предохранитель токенов

const HAS_CYRILLIC = /[а-яё]/i;

/** Перевод через Edge Function translate (тот же контракт, что фронт) */
async function translate(text, targetLang) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ text, target_lang: targetLang }),
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = await res.json();
  const out = typeof data?.translated_text === 'string' ? data.translated_text.trim() : '';
  if (!out) throw new Error('translate: пустой ответ');
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { data, error } = await db
    .from('events')
    .select('id, title, description, title_ru, description_ru, title_en, description_en, source_lang')
    .eq('status', 'active')
    .limit(1000);
  if (error) throw error;

  const rows = (data || []).filter((ev) => {
    const ruTitle = ev.title_ru || ev.title || '';
    const needs = !ev.title_en || !ev.description_en;
    const ruOrigin = ev.source_lang === 'ru' || HAS_CYRILLIC.test(ruTitle);
    return needs && ruOrigin;
  });
  const batch = rows.slice(0, LIMIT);
  console.log(`Событий с EN-переводом: ${(rows.length - batch.length)} останется, обрабатываем ${batch.length} из ${rows.length}`);

  let ok = 0;
  let fail = 0;
  for (const ev of batch) {
    const srcTitle = ev.title_ru || ev.title || '';
    const srcDesc = ev.description_ru || ev.description || ev.description_en || '';
    try {
      const [titleEn, descEn] = await Promise.all([
        translate(srcTitle, 'en'),
        srcDesc.trim() ? translate(srcDesc, 'en') : Promise.resolve(''),
      ]);
      if (DRY_RUN) {
        console.log(`  [dry] ${String(srcTitle).slice(0, 50)}`);
      } else {
        const { error: uErr } = await db
          .from('events')
          .update({
            title_en: titleEn || null,
            description_en: descEn || null,
            source_lang: 'ru',
          })
          .eq('id', ev.id);
        if (uErr) throw uErr;
      }
      ok += 1;
      console.log(`  + ${String(srcTitle).slice(0, 55)}`);
    } catch (err) {
      fail += 1;
      console.error(`  ! ${String(srcTitle).slice(0, 45)}: ${err.message}`);
    }
    await sleep(400);
  }
  console.log(`Готово: переведено ${ok}, ошибок ${fail}. Осталось без EN: ${rows.length - batch.length}`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
