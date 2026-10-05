// Ремонт класса «время кипрских карточек записано в UTC»: сборщик брал slice(11,16) из ISO-строки
// источников, а cyprusnow API и cyprus.bz JSON-LD отдают UTC («2026-11-01T07:00:00+00:00» при
// показе на странице 09:00, Asia/Nicosia) → на карте событие стояло на 2–3 часа раньше реального.
// Здесь обратное преобразование: сохранённые ЧЧ:ММ считаем UTC-временем даты start_date
// и переводим в кипрское (Asia/Nicosia); при переходе через полночь двигаем и дату.
// Корневая причина закрыта в collect-cyprus.mjs (cyHM).
// Проверка (05.10, запуск 46): cyprusnow JSON-LD rendezvous = 2026-10-17T20:30:00+03:00 (страница: 20:30),
// cyprus.bz JSON-LD = 2026-10-17T17:30:00+00:00 — тот же момент, в базе 17:30 (UTC-час);
// Race for the Cure: JSON-LD 2026-11-01T09:00:00+02:00 (09:00 местного), в базе 07:00.
// Запуск: DRY (по умолчанию) / APPLY=1
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const HOSTS = ['cyprusnow.app', 'cyprus.bz'];
const STATUSES = ['active', 'moderation', 'needs_changes'];

const HM = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Nicosia', hour: '2-digit', minute: '2-digit', hour12: false });
const toLocal = (date, hm) => {
  if (!date || !hm) return null;
  const d = new Date(`${date}T${hm.slice(0, 5)}:00Z`);
  return Number.isNaN(d.getTime()) ? null : HM.format(d);
};
// 1 — время ушло на следующие сутки (21:00Z + 3 ч = 00:00), иначе 0
const dayShift = (date, hm, newHm) => {
  if (!date || !hm || !newHm) return 0;
  return newHm.slice(0, 5) <= hm.slice(0, 5) ? 1 : 0;
};
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hostOf = (u) => { try { return new URL(u).host.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

const rows = await selectAll(db, 'events', 'id,status,start_date,start_time,end_date,end_time,city,website,source_type');
const targets = rows.filter((r) => STATUSES.includes(r.status) && r.start_time && HOSTS.includes(hostOf(r.website)));
console.log(`Строк всего ${rows.length}; кипрских источников со временем (${STATUSES.join('/')}) — ${targets.length}`);

const plan = [];
for (const r of targets) {
  const ns = toLocal(r.start_date, r.start_time);
  const endDate = r.end_date || r.start_date;
  const ne = r.end_time ? toLocal(endDate, r.end_time) : null;
  const ds = ns && ns !== r.start_time ? dayShift(r.start_date, r.start_time, ns) : 0;
  const de = ne && r.end_time && ne !== r.end_time ? dayShift(endDate, r.end_time, ne) : 0;
  if (ns !== r.start_time || (ne && ne !== r.end_time) || ds || de) {
    plan.push({
      id: r.id, city: r.city, website: hostOf(r.website), status: r.status,
      start_date: r.start_date, from: r.start_time, to: ns, newStart: ds ? addDays(r.start_date, ds) : null,
      end_date: r.end_date, eFrom: r.end_time, eTo: ne, newEnd: de ? addDays(endDate, de) : null,
    });
  }
}
console.log(`К правке: ${plan.length}`);
const byHost = {};
for (const p of plan) byHost[p.website] = (byHost[p.website] || 0) + 1;
console.log('по источникам:', JSON.stringify(byHost));
console.log(`со сдвигом даты (переход через полночь): ${plan.filter((p) => p.newStart || p.newEnd).length}`);
for (const p of plan.slice(0, 10)) {
  console.log(`  ${p.id.slice(0, 8)} [${p.status}] ${p.start_date} ${p.from} -> ${p.to}${p.newStart ? ' (дата ' + p.newStart + ')' : ''} (${p.website}) ${p.city}`);
}
if (plan.length > 10) console.log(`  ... ещё ${plan.length - 10}`);

if (!APPLY) { console.log('\n[dry] без записи. APPLY=1 — применить.'); process.exit(0); }
let ok = 0, fail = 0;
for (const p of plan) {
  const patch = { start_time: p.to };
  if (p.eTo) patch.end_time = p.eTo;
  if (p.newStart) patch.start_date = p.newStart;
  if (p.newEnd) patch.end_date = p.newEnd;
  const { data, error } = await db.from('events').update(patch).eq('id', p.id).select('id');
  if (error || !data?.length) { fail++; console.error('  ! ошибка', p.id.slice(0, 8), error?.message || 'изменено 0 строк'); } else ok++;
}
console.log(`\nПрименено: ${ok}, ошибок: ${fail}`);
