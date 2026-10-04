// Аудит архивных карточек запуска 18 (04.10): они заархивированы СТАРЫМ ключом
// «живого дубля» (до усиления GENERIC/PLACE_STOP от ложных halloween/park).
// Вопрос: нет ли среди них ложных срабатываний — разных событий, склеенных по
// шаблонным токенам и уехавших в архив при живом близнеце другого события.
//
// Метод: для каждой архивной карточки с будущей датой ищем пару среди active
// дважды — старым ключом (без исключений halloween/park) и новым (текущий модуль).
//   старый есть + новый нет  -> вердикт усиления изменился => кандидат в возврат
//   старый есть + новый есть -> архив верен
//   старого нет + новый есть -> необъяснимо, печатаем
//
// Запуск: node --env-file=.env scripts/dot-archived-live-dupe-audit.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { norm, aliases, cityKey, hasCoords, distanceM, isCityLevelAddr, STOP, GENERIC, PLACE_STOP, samePlace, overlap, liveDupeMatch } from './live-dupe-key.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const TODAY = new Date().toISOString().slice(0, 10);

// --- старый (до усиления) ключ: те же функции, но без сезонных/парковых исключений
const GENERIC_OLD = new Set([...GENERIC].filter((w) => !['halloween', 'хэллоуин', 'хэллоуинская', 'хэллоуинской', 'хэллоуинский', 'psyloween'].includes(w)));
const PLACE_OLD = new Set([...PLACE_STOP].filter((w) => !['park', 'парк', 'парке', 'парка'].includes(w)));
const wordsOld = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w)))];
function samePlaceOld(a, b) {
  const na = norm(a.address), nb = norm(b.address);
  if (na && na === nb) return 'адрес=';
  const ws = (s) => new Set(wordsOld(s).filter((w) => !GENERIC_OLD.has(w) && !PLACE_OLD.has(w)));
  const sa = ws(na), sb = ws(nb);
  for (const w of sa) if (sb.has(w)) return `адрес~${w}`;
  if (hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 300) return 'коорд≤300м';
  if ((isCityLevelAddr(a) || isCityLevelAddr(b)) && hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 5000) return 'город-заглушка';
  return null;
}
function overlapOld(a, b) {
  let best = 0;
  for (const wa of aliases(a)) for (const wb of aliases(b)) {
    const sb = new Set(wordsOld(wb));
    let n = 0; for (const w of wordsOld(wa)) if (sb.has(w)) n++;
    best = Math.max(best, n);
  }
  return best;
}
const oldMatch = (a, b) => (a.start_date || '').slice(0, 10) === (b.start_date || '').slice(0, 10) && cityKey(a) === cityKey(b)
  && overlapOld(a, b) >= 3 && samePlaceOld(a, b) ? `старый (${samePlaceOld(a, b)})` : null;

const cols = 'id,title,title_ru,title_en,city,address,start_date,status,website,source_type,lat,lng,created_at';
const archived = await selectAll(db, 'events', cols, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation']) });
console.log(`archive-future ${archived.length}; live ${live.length}; сегодня ${TODAY}`);

const liveByDay = new Map();
for (const r of live) {
  const k = `${(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;
  if (!liveByDay.has(k)) liveByDay.set(k, []);
  liveByDay.get(k).push(r);
}

const falsePositives = [], unexplained = [], confirmed = [];
const unmatched = [];
for (const a of archived) {
  const k = `${(a.start_date || '').slice(0, 10)}|${cityKey(a)}`;
  const cand = liveByDay.get(k) || [];
  let oldHit = null, newHit = null;
  for (const b of cand) {
    const o = oldMatch(a, b), n = liveDupeMatch(a, b);
    if (o && !oldHit) oldHit = { b, o };
    if (n && !newHit) newHit = { b, n };
  }
  if (oldHit && !newHit) falsePositives.push({ a, b: oldHit.b, o: oldHit.o });
  else if (!oldHit && newHit) unexplained.push({ a, b: newHit.b, n: newHit.n });
  else if (oldHit && newHit) confirmed.push({ a, b: newHit.b });
  else unmatched.push(a);
}

const show = (r) => `«${(r.title_ru || r.title || '').slice(0, 60)}» ${r.address || '-'} ${r.website || ''}`;
console.log(`\n=== КАНДИДАТЫ В ВОЗВРАТ (старый ключ склеил, усиленный — нет): ${falsePositives.length}`);
for (const { a, b, o } of falsePositives) {
  console.log(`arch ${a.id.slice(0, 8)} ${show(a)}`);
  console.log(`  ~active ${b.id.slice(0, 8)} ${show(b)}   [${o}; слов(старый) ${overlapOld(a, b)}, слов(новый) ${overlap(a, b)}]`);
}
console.log(`\n=== АРХИВ ПОДТВЕРЖДЁН (усиленный ключ тоже видит дубль): ${confirmed.length}`);
console.log(`=== НЕОБЪЯСНИМО (старый не видел, новый видит): ${unexplained.length}`);
for (const { a, b, n } of unexplained) console.log(`arch ${a.id.slice(0, 8)} ${show(a)}\n  ~active ${b.id.slice(0, 8)} ${show(b)} [${n}]`);

console.log(`\n=== БЕЗ ЖИВОГО БЛИЗНЕЦА (архив по другим правилам/причинам): ${unmatched.length}`);
for (const a of unmatched) {
  const archTwin = archived.find((x) => x.id !== a.id && oldMatch(a, x));
  console.log(`arch ${a.id.slice(0, 8)} ${(a.start_date || '').slice(0, 10)} ${cityKey(a)} ${show(a)}${archTwin ? ` | близнец в архиве: ${archTwin.id.slice(0, 8)}` : ''}`);
}

if (!APPLY) { console.log('\nDRY RUN (для возврата в active: --apply)'); process.exit(0); }
const ids = falsePositives.map((x) => x.a.id);
let done = 0;
for (let i = 0; i < ids.length; i += 50) {
  const part = ids.slice(i, i + 50);
  const { data, error } = await db.from('events').update({ status: 'active' }).in('id', part).select('id');
  if (error) { console.error('ошибка:', error.message); continue; }
  done += (data || []).length;
}
console.log(`возвращено в active: ${done}`);
