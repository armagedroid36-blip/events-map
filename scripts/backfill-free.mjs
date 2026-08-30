// Backfill «Бесплатно»: у событий с маркерами бесплатности в описании
// («бесплатн», «вход свободн», «free entry», «свободный») LLM подтверждает
// free=true → ставим price=0 (карточка показывает «Бесплатно», фильтр
// «Бесплатные» ловит). Частично платные («бесплатно до 22:00») LLM отсекает
// (free=false) — такие не трогаем. Запускается в GitHub Actions после
// backfill-address; лимит 50 за запуск.
import { createClient } from '@supabase/supabase-js';
import { extractPrice } from './price-llm.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.LIMIT || 50); // предохранитель: токены LLM

async function main() {
  const { data, error } = await db
    .from('events')
    .select('id, title, description, city')
    .in('status', ['active', 'moderation'])
    .is('price', null)
    .eq('donation', false)
    .or('description.ilike.%бесплатн%,description.ilike.%вход свободн%,description.ilike.%free entry%,description.ilike.%свободный%')
    .limit(LIMIT);
  if (error) throw error;

  const rows = data || [];
  let filled = 0;
  for (const ev of rows) {
    const text = `${ev.description || ''} ${ev.title || ''}`.trim();
    if (!text) continue;
    // Страховка от ошибок LLM: если в тексте есть ЛЮБЫЕ цены (даже частичные:
    // «бесплатно до 22:00», «150k», «по QR бесплатно, без QR 300k») — событие
    // частично платное, НЕ помечаем бесплатным.
    if (/\d[\d\s.,]*(?:k|тыс|млн|₽|руб|\$|usd|eur|idr|rp|vnd|đ)/i.test(text)) continue;
    const p = await extractPrice(text, ev.city);
    if (!p || p.free !== true) continue; // частично платные / нет данных — не трогаем

    const { error: uErr } = DRY_RUN
      ? { error: null }
      : await db.from('events').update({ price: 0 }).eq('id', ev.id);
    if (uErr) {
      console.error(`  Ошибка обновления «${String(ev.title).slice(0, 40)}»: ${uErr.message}`);
    } else {
      filled++;
      console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${String(ev.title).slice(0, 45)} → price=0`);
    }
  }

  console.log(`Готово: помечено бесплатными ${filled} из ${rows.length}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
