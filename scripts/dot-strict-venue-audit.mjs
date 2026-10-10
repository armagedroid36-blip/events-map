// Остаток ТОГО ЖЕ класса (запуск 161) в СТРОГОМ ключе: liveDupeMatch требует overlap >= 3
// + совпадение места, а overlap() считает слова адреса значимыми (PLACE_STOP в нём не применяется).
// Значит два РАЗНЫХ вечера одной площадки («Stand-up Night … Dusty Munky» ↔ «Quiz Night … Dusty Munky»)
// могут набрать 3 общих слова (тип события + название клуба) и склеиться.
// Зонд: по живым парам (тот же день+город, место совпало) считает пары, которые текущий строгий ключ
// склеивает, и отдельно те, где ВСЕ общие слова — слова адреса (ovCore = 0).
// Запуск: node --env-file=.env scripts/dot-strict-venue-audit.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { dayKey, samePlace, overlap, abbrevWords, liveDupeMatch } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const COL = 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,lat,lng';
const live = await selectAll(db, 'events', COL, { filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']) });
console.log(`живых: ${live.length}`);
const groups = new Map();
for (const r of live) { const k = dayKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }

const ovCoreOf = (a, b) => {
  const addr = new Set([...abbrevWords(a.address), ...abbrevWords(b.address)]);
  let best = 0;
  for (const ta of [a.title, a.title_ru, a.title_en].filter(Boolean))
    for (const tb of [b.title, b.title_ru, b.title_en].filter(Boolean)) {
      const s = new Set(abbrevWords(tb));
      let n = 0; for (const w of abbrevWords(ta)) if (s.has(w) && !addr.has(w)) n++;
      best = Math.max(best, n);
    }
  return best;
};

let pairs = 0, merged = 0, venueOnly = [];
for (const [, g] of groups) {
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    if (!samePlace(a, b) || overlap(a, b) < 3) continue;
    pairs++;
    const why = liveDupeMatch(a, b);
    if (!why) continue;
    merged++;
    if (ovCoreOf(a, b) === 0) venueOnly.push({ a, b, why });
  }
}
console.log(`пар-кандидатов (место+3 слова): ${pairs}; строгий ключ склеивает: ${merged}`);
console.log(`из них БЕЗ общих слов вне адреса (тот же класс): ${venueOnly.length}`);
for (const { a, b, why } of venueOnly) {
  console.log(`  ${String(a.id).slice(0, 8)} «${(a.title_ru || a.title || '').slice(0, 45)}» ↔ ${String(b.id).slice(0, 8)} «${(b.title_ru || b.title || '').slice(0, 45)}» ${(a.start_date || '').slice(0, 10)} ${a.city} | ${why}`);
}
