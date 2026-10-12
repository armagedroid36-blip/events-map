// Ремонт класса «время-заглушка 23:59» у живых карточек Балифорума.
//
// Корень закрыт в сборщике (scripts/start-time-stub.mjs): лента Балифорума пишет
// «23:59:59» событиям без указанного времени. Здесь чиним уже собранные карточки —
// но не «по шаблону», а сверяя запись источника по слагу страницы: время карточки
// снимается только если лента для ЭТОЙ даты тоже отдаёт 23:59:59 (нулевая
// длительность = заглушка). Карточки других источников (Cyprus Now отдаёт настоящее
// локальное 23:59 у клубных вечеров) не трогаются.
//
// Запуск: node --env-file=.env scripts/dot-start-time-stub-fix.mjs [--apply]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isStubTime } from './start-time-stub.mjs';

const run = promisify(execFile);
const APPLY = process.argv.includes('--apply');
const LIVE = ['active', 'moderation', 'needs_changes'];
const PROXY = 'http://127.0.0.1:10809';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

async function fetchFeedEvent(slug) {
  const out = path.join(os.tmpdir(), `bf-${slug.slice(0, 40)}.json`);
  const args = ['-s', '--max-time', '25', '-o', out, `https://baliforum.ru/api/v1/events/${slug}`];
  try {
    await run('curl', ['-x', PROXY, ...args], { maxBuffer: 1 << 26 });
  } catch {
    await run('curl', args, { maxBuffer: 1 << 26 }); // без прокси — API отвечает и напрямую
  }
  const { stdout } = await run('node', ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(out)},'utf8'))`]);
  return JSON.parse(stdout);
}

const all = await selectAll(db, 'events', 'id,title,city,start_date,start_time,end_time,status,website');
const live = all.filter((r) => LIVE.includes(r.status));
const targets = live.filter(
  (r) => String(r.start_time || '').startsWith('23:59') && String(r.website || '').includes('baliforum.ru/events/'),
);
console.log(`живых ${live.length}, кандидатов (23:59 + Балифорум) ${targets.length}${APPLY ? '' : ' [DRY]'}`);

const confirmed = [];
const skipped = [];
let errors = 0;
const CONC = 8;
for (let i = 0; i < targets.length; i += CONC) {
  const batch = targets.slice(i, i + CONC);
  await Promise.all(batch.map(async (r) => {
    const slug = String(r.website).split('/events/')[1].split(/[?#]/)[0];
    let ev;
    try { ev = await fetchFeedEvent(slug); } catch (e) { errors++; skipped.push(`${r.id.slice(0, 8)} лента не читается: ${e.message.slice(0, 60)}`); return; }
    const dates = (ev?.data?.eventDates) || [];
    const same = dates.find((d) => String(d.startAt).slice(0, 10) === r.start_date);
    const anyStub = dates.filter((d) => isStubTime(d.startAt) && isStubTime(d.endAt)).length;
    if (!same) { skipped.push(`${r.id.slice(0, 8)} нет даты ${r.start_date} в ленте`); return; }
    const sameStub = isStubTime(same.startAt) && isStubTime(same.endAt);
    if (!sameStub || anyStub === 0) { skipped.push(`${r.id.slice(0, 8)} лента даёт ${same.startAt}→${same.endAt} (не заглушка)`); return; }
    confirmed.push({ id: r.id, title: r.title, start_date: r.start_date, from: r.start_time, dates: dates.length });
  }));
}

console.log(`подтверждено источником: ${confirmed.length}, пропущено: ${skipped.length}, ошибок чтения: ${errors}`);
for (const s of skipped.slice(0, 8)) console.log('  пропуск:', s);

let written = 0;
if (APPLY) {
  for (const c of confirmed) {
    const { data, error } = await db.from('events').update({ start_time: null }).eq('id', c.id).eq('start_time', c.from).select('id,start_time,status,start_date');
    if (error || !data?.length) { console.log('  ОШИБКА записи', c.id.slice(0, 8), error?.message || 'нет строк'); continue; }
    written++;
  }
  console.log(`записано ${written}, ошибок ${confirmed.length - written}`);
  // контроль чтением
  const after = await selectAll(db, 'events', 'id,start_time,status,start_date,updated_at');
  const byId = new Map(after.map((r) => [r.id, r]));
  let bad = 0;
  for (const c of confirmed) {
    const row = byId.get(c.id);
    if (!row || row.start_time !== null) { bad++; console.log('  КОНТРОЛЬ не сошёлся', c.id.slice(0, 8), JSON.stringify(row?.start_time)); }
  }
  console.log(`контроль: обнулено ${confirmed.length - bad}/${confirmed.length}`);
  const left = after.filter((r) => LIVE.includes(r.status) && String(r.start_time || '').startsWith('23:59')).length;
  console.log(`осталось живых с 23:59 (другие источники): ${left}`);
}
