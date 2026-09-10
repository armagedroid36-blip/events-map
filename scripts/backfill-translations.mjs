// Backfill переводов событий (промпт R, п. 2.2): находит события активные и
// ждущие публикации (moderation, needs_changes) с русским оригиналом
// (source_lang='ru' ИЛИ кириллица в title/описании) и без EN-текста
// (или с битым — кириллица в EN), переводит title и description и обновляет
// поля через service role. Возобновляемый: повторный запуск добивает
// оставшиеся (уже переведённые не трогает — идемпотентно).
//
// Перевод: DeepSeek напрямую (DEEPSEEK_API_KEY, промпт — копия Edge Function
// translate) либо, если ключа нет, через Edge Function translate (anon-ключ —
// как фронтенд src/lib/translate.ts; лимит публичной функции 10 запросов/мин
// на IP — при 429 скрипт ждёт и повторяет).
//
// Переводится событие, если EN-текста нет ИЛИ в нём осталась кириллица
// (битый перевод); уже готовые поля не перезаписываются. Результат проверяется
// на кириллицу и при остатках повторяется со строгим промптом.
//
// env: LIMIT (по умолчанию 120) — максимум событий за запуск,
//      CONCURRENCY (3) — параллельных событий, PAUSE_MS (400) — пауза воркера.
//
// Запуск: source .env (SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE,
// VITE_SUPABASE_ANON_KEY, DEEPSEEK_API_KEY) && node scripts/backfill-translations.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
// anon-ключ фронтенда публичный; в CI может отсутствовать как secret —
// тогда для заголовка Authorization берём service role (Edge Function translate
// этот заголовок не проверяет, контракт вызова не меняется).
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE (VITE_SUPABASE_ANON_KEY опционален)');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 120); // предохранитель токенов
const CONCURRENCY = Number(process.env.CONCURRENCY || 3); // параллельных переводов
const PAUSE_MS = Number(process.env.PAUSE_MS || 400); // пауза между событиями в воркере
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const HAS_CYRILLIC = /[а-яё]/i;
// Кириллица для проверки КАЧЕСТВА перевода: любая кириллическая буква
// (в EN-тексте её быть не должно — критерий приёмки SEO).
const CYR = /[\u0400-\u04FF]/;
// Для гейта качества — только НАСТОЯЩИЕ русские слова: 2+ кириллических
// символа подряд или одиночная буква-слово. Одиночные кириллические
// «двойники» латинских букв внутри латинских слов/адресов (напр. «3Х Studio»,
// где Х — U+0425) перевод не ломают и повторных переводов не требуют.
const CYR_WORD = /[\u0400-\u04FF]{2,}|(?:^|\s)[\u0400-\u04FF](?=\s|$)/m;
const STRICT_SUFFIX =
  '\n\nВАЖНО: переведи ВСЁ на английский, в ответе не должно остаться ни одного ' +
  'кириллического символа: имена, бренды и названия мест — латиницей.';

/** Перевод через Edge Function translate (тот же контракт, что фронт) */
async function translateViaEdge(text, targetLang, _strict = false) {
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

// --- Прямой вызов DeepSeek (основной путь, когда есть DEEPSEEK_API_KEY) ---
// Промпт и параметры — копия Edge Function translate (supabase/functions/
// translate/index.ts): публичная функция ограничена 10 запросами/мин на IP,
// поэтому бэкфилл сотен событий упирается в 429 и растягивается на часы.
// DEEPSEEK_API_KEY уже передаётся workflow для сборщиков.
const MODEL = 'deepseek-chat';
const MAX_INPUT_CHARS = 2000; // как в Edge Function
const SYSTEM_PROMPT =
  'Ты переводишь тексты афиш и событий (название или описание) с русского на ' +
  'английский или с английского на русский. Сохрани смысл, факты, даты, цены и ' +
  'стиль оригинала. Названия мест, имена и бренды транслитерируй (не переводи). ' +
  'Верни ТОЛЬКО переведённый текст без кавычек, комментариев и пояснений.';

async function translateViaDeepSeek(text, targetLang, strict = false) {
  const langName = targetLang === 'ru' ? 'русский' : 'английский';
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Переведи на ${langName} язык:\n\n${String(text).slice(0, MAX_INPUT_CHARS)}` +
            (strict ? STRICT_SUFFIX : ''),
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`deepseek ${res.status}: ${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const out = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';
  if (!out) throw new Error('deepseek: пустой ответ');
  return out;
}

/** Перевод: DeepSeek напрямую (если есть ключ), иначе Edge Function translate.
 *  429 (лимит публичной функции 10/мин на IP) и сетевые сбои — пауза и повтор. */
async function translate(text, targetLang, strict = false) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return DEEPSEEK_API_KEY
        ? await translateViaDeepSeek(text, targetLang, strict)
        : await translateViaEdge(text, targetLang, strict);
    } catch (err) {
      const msg = String(err?.message || err);
      if (attempt < 4 && /429/.test(msg)) {
        console.warn(`  ~ лимит перевода, пауза 62 с (попытка ${attempt}/3)`);
        await sleep(62000);
        continue;
      }
      // сетевые сбои (DeepSeek из RU-сети нестабилен) — короткий повтор
      if (attempt < 4 && /fetch failed|network|ECONN|ETIMEDOUT|socket|ENOTFOUND/i.test(msg)) {
        console.warn(`  ~ сеть: ${msg.slice(0, 60)} — повтор через 3 с (попытка ${attempt}/3)`);
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('translate: лимит запросов не снят');
}

/** Перевод RU→EN с проверкой качества: если в ответе осталась кириллица,
 *  повторяем со строгим промптом (критерий приёмки — EN-страница без
 *  кириллицы). Возвращаем последний результат даже с остатками — лучше
 *  частичный перевод, чем пустое поле. */
async function translateEn(text) {
  let out = await translate(text, 'en');
  for (let i = 0; i < 2 && CYR_WORD.test(out); i += 1) {
    console.warn('  ~ в переводе осталась кириллица — повтор со строгим промптом');
    out = await translate(text, 'en', true);
  }
  if (CYR_WORD.test(out)) console.warn(`  ~ кириллица осталась после повторов: ${out.slice(0, 60)}`);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { data, error } = await db
    .from('events')
    .select('id, title, description, title_ru, description_ru, title_en, description_en, source_lang')
    // Переводим не только опубликованные, но и ждущие модерации/правок:
    // иначе одобренное событие попадает на сайт (и в следующий деплой) без
    // EN-версии до следующего запуска сбора. Архив/отклонённые не трогаем.
    .in('status', ['active', 'moderation', 'needs_changes'])
    .limit(2000);
  if (error) throw error;

  const rows = (data || []).filter((ev) => {
    const ruTitle = ev.title_ru || ev.title || '';
    const ruFields = [ev.title_ru, ev.title, ev.description_ru, ev.description]
      .filter(Boolean)
      .join('\n');
    // событие нужно перевести, если EN-текста нет ИЛИ он с кириллицей
    // (битый перевод: LLM оставила русские слова)
    const needs =
      !ev.title_en ||
      !ev.description_en ||
      CYR_WORD.test(String(ev.title_en || '')) ||
      CYR_WORD.test(String(ev.description_en || ''));
    const ruOrigin = ev.source_lang === 'ru' || HAS_CYRILLIC.test(ruTitle) || CYR.test(ruFields);
    return needs && ruOrigin;
  });
  const batch = rows.slice(0, LIMIT);
  console.log(`Событий без полного EN: ${rows.length}; обрабатываем ${batch.length} (LIMIT=${LIMIT})`);
  if (!batch.length) {
    console.log('Готово: переведено 0, ошибок 0. Осталось без EN: 0');
    return;
  }

  let ok = 0;
  let fail = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= batch.length) return;
      const ev = batch[i];
      const srcTitle = ev.title_ru || ev.title || '';
      const srcDesc = ev.description_ru || ev.description || ev.description_en || '';
      // переводим только то, чего нет/что битое — уже готовые поля не трогаем
      const needTitle = !ev.title_en || CYR_WORD.test(String(ev.title_en));
      const needDesc = !ev.description_en || CYR_WORD.test(String(ev.description_en));
      try {
        const [titleEn, descEn] = await Promise.all([
          needTitle ? translateEn(srcTitle) : Promise.resolve(ev.title_en || ''),
          needDesc && srcDesc.trim() ? translateEn(srcDesc) : Promise.resolve(ev.description_en || ''),
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
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, batch.length)) }, worker),
  );
  console.log(`Готово: переведено ${ok}, ошибок ${fail}. Осталось без EN: ${rows.length - ok}`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
