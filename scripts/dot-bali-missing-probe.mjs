import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const dir = `${process.env.LOCALAPPDATA}/Temp/balib`;
const target = 'chto-bylo-bali-improvizatsionnoe-shou';
let ev = null;
for (const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`,'utf8'));
  for (const e of j.data||[]) if (e.slug === target) ev = e;
}
if (ev) {
  console.log('Запись ленты:', ev.title, '| slug', ev.slug);
  console.log('eventDates:', JSON.stringify(ev.eventDates || ev.dates || null).slice(0,400));
  console.log('place:', JSON.stringify(ev.place || null).slice(0,300));
} else console.log('нет в скачанных страницах (дальше 12-й)');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,city,title,title_ru,start_date,website', {});
const hits = rows.filter(r => /Что было Бали|chto-bylo-bali|импровизационное шоу/i.test(String(r.title)+' '+String(r.title_ru||'')+' '+String(r.website||'')));
console.log('Похожих в базе:', hits.length);
for (const r of hits) console.log(`  ${r.id.slice(0,8)} [${r.status}] ${r.start_date} ${r.city} | ${String(r.title).slice(0,50)} | ${r.website}`);
