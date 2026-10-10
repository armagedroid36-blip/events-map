// Аудит ОСТАТКА класса, закрытого в запуске 161: «слова названия ПЛОЩАДКИ в заголовках
// считались доказательством одного события» (abbrevOverlap: dusty+munky → «2 слова + адрес»).
// Корень закрыт в ключе (liveAbbrevMatch требует ovCore >= 1), но карточки, заархивированные
// СТАРЫМ правилом, в базе остались — дедуп их сам не вернёт.
//
// Кандидат в возврат = архивная карточка с БУДУЩЕЙ датой, у которой есть живая карточка на
// тот же день/город, для которой:
//   * ТЕКУЩИЙ ключ её НЕ склеивает (liveDupeMatch / liveAbbrevMatch / liveLangPlaceMatch = null),
//   * но старое правило сработало бы: аббрев-пересечение >= 2, все общие слова — слова адреса (ovCore = 0),
//   * место совпадает (адрес= / адрес~ / коорд<=300м / город-заглушка),
//   * ссылки источника разные (разные страницы = разные события).
// Запуск: node --env-file=.env scripts/dot-venue-word-archive-audit.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { dayKey, samePlace, abbrevOverlap, abbrevWords, liveDupeMatch, liveAbbrevMatch, liveLangPlaceMatch, isCityLevelAddr } from './live-dupe-key.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);
const COL = 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,lat,lng,created_at,source_type';

const archived = await selectAll(db, 'events', COL, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', COL, { filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']) });
console.log(`архивных с будущей датой: ${archived.length}; живых: ${live.length}; сегодня ${TODAY}`);

const byDay = new Map();
for (const b of live) {
  const k = dayKey(b);
  if (!byDay.has(k)) byDay.set(k, []);
  byDay.get(k).push(b);
}
const canon = (u) => { if (!u) return null; try { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return null; } };
const ovCoreOf = (a, b) => {
  const sa = new Set(abbrevWords(a.address)), sb = new Set(abbrevWords(b.address));
  const addr = new Set([...sa, ...sb]);
  let best = 0;
  for (const ta of [a.title, a.title_ru, a.title_en].filter(Boolean))
    for (const tb of [b.title, b.title_ru, b.title_en].filter(Boolean)) {
      const s = new Set(abbrevWords(tb));
      let n = 0; for (const w of abbrevWords(ta)) if (s.has(w) && !addr.has(w)) n++;
      best = Math.max(best, n);
    }
  return best;
};

const cands = [];
for (const a of archived) {
  const cand = byDay.get(dayKey(a)) || [];
  for (const b of cand) {
    if (canon(a.website) && canon(a.website) === canon(b.website)) continue;      // та же страница — не наша пара
    if (liveDupeMatch(a, b) || liveAbbrevMatch(a, b) || liveLangPlaceMatch(a, b)) continue; // текущий ключ склеивает — законно
    const ov = abbrevOverlap(a, b);
    if (ov < 2) continue;
    if (ovCoreOf(a, b) !== 0) continue;                                          // есть общее слово вне адреса — не класс площадки
    const place = samePlace(a, b);
    if (!place) continue;
    if (isCityLevelAddr(a) && isCityLevelAddr(b)) continue;
    cands.push({ a, b, ov, place });
    break;
  }
}
console.log(`\nкандидатов «ложная склейка по названию площадки»: ${cands.length}`);
for (const c of cands) {
  console.log(`  arch ${String(c.a.id).slice(0, 8)} «${(c.a.title_ru || c.a.title || '').slice(0, 50)}» ${(c.a.start_date || '').slice(0, 10)} ${c.a.start_time || ''} | ${c.a.address}`);
  console.log(`       live ${String(c.b.id).slice(0, 8)} «${(c.b.title_ru || c.b.title || '').slice(0, 50)}» ${(c.b.start_date || '').slice(0, 10)} ${c.b.start_time || ''} | ${c.b.address} | общих ${c.ov} (${c.place})`);
}
if (!cands.length) { console.log('класс в архиве чист'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN (вернуть в moderation: --apply)'); process.exit(0); }
let done = 0;
for (const c of cands) {
  const r = await db.from('events').update({ status: 'moderation' }).eq('id', c.a.id).select('id,status');
  if (r.error) { console.log('ошибка ' + String(c.a.id).slice(0, 8) + ': ' + r.error.message); continue; }
  if (!r.data?.length) { console.log('0 строк обновлено (RLS?): ' + String(c.a.id).slice(0, 8)); continue; }
  done += 1;
}
console.log(`возвращено archived -> moderation: ${done}`);
