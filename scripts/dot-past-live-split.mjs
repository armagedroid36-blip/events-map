// Читающий зонд: класс «живая карточка с start_date в прошлом» — сколько из них
// ДОЛЖНЫ были уйти в archived правилом archive-past.mjs (end_date < today ИЛИ start_date < today без повтора),
// а сколько держатся законно (end_date в будущем = событие длится; recurrence = регулярная серия).
// Плюс: карточки без координат и подозрительно длинные интервалы у «однодневных» названий.
// Запуск: node --env-file=.env scripts/dot-past-live-split.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const today = new Date().toISOString().slice(0, 10);

const rows = await selectAll(db, 'events', 'id,title,status,start_date,end_date,recurrence,city,source_type,lat,lng,website');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const past = live.filter((r) => r.start_date && r.start_date < today);

const hasRec = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') { const s = v.trim(); return s !== '' && s !== 'null'; }
  return true;
};
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const shouldArchive = past.filter((r) => !hasRec(r.recurrence) && (!r.end_date || r.end_date < today));
const keptByEnd = past.filter((r) => !hasRec(r.recurrence) && r.end_date && r.end_date >= today);
const rec = past.filter((r) => hasRec(r.recurrence));

console.log(`сегодня ${today}; живых ${live.length}; start_date в прошлом ${past.length}`);
console.log(`ДОЛЖНЫ быть archived (не заархивированы) = ${shouldArchive.length}`);
shouldArchive.slice(0, 30).forEach((r) => console.log(`  ${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${r.start_date}..${r.end_date} | ${String(r.title).slice(0, 50)}`));
console.log(`держит end_date в будущем (норма: событие длится) = ${keptByEnd.length}`);
console.log(`recurrence (норма: серия) = ${rec.length}`);

console.log('\n== длинные интервалы у «событие дня» (спан > 7 дней, start в прошлом)');
keptByEnd
  .map((r) => ({ ...r, span: days(r.start_date, r.end_date) }))
  .filter((r) => r.span > 7)
  .sort((a, b) => b.span - a.span)
  .slice(0, 15)
  .forEach((r) => console.log(`  ${r.id.slice(0, 8)} спан ${r.span} дн | ${r.start_date}..${r.end_date} | ${r.city} | ${String(r.title).slice(0, 55)}`));

console.log('\n== живые без координат');
live.filter((r) => r.lat == null || r.lng == null).forEach((r) => console.log(`  ${r.id} [${r.status}] ${r.city} | ${r.start_date} | ${String(r.title).slice(0, 60)} | ${r.website || 'без ссылки'}`));
