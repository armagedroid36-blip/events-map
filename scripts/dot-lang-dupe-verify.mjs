// Читающая проба: полные поля пар «одно место в двух языках» + поиск архивных близнецов.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const IDS = ['04f731ea','cd50ee20','05c07b5e','5abadaf6','287f1564','d6d536c7','633a31c7','d70a20df'];

const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,start_date,start_time,end_date,city,address,lat,lng,website,status,source_type,auto_review,created_at,recurrence');
const short = (id) => rows.filter(r => r.id.startsWith(id))[0];
for (const id of IDS) {
  const r = short(id);
  if (!r) { console.log(id, 'НЕ НАЙДЕН'); continue; }
  console.log(`\n== ${r.id.slice(0,8)} [${r.status}] ${r.source_type} | ${r.start_date} ${r.start_time || '--'}${r.end_date ? ' → ' + r.end_date : ''}`);
  console.log(`   city=${r.city} | addr=${r.address} | geo=${r.lat},${r.lng}`);
  console.log(`   rec=${r.recurrence ? JSON.stringify(r.recurrence).slice(0, 80) : '—'} | created=${r.created_at}`);
  console.log(`   url=${r.website}`);
  console.log(`   RU: ${(r.title_ru || '—').slice(0, 60)}`);
  console.log(`   EN: ${(r.title_en || '—').slice(0, 60)}`);
}
// близнецы по названию (первые 4 значимых слова) — все статусы
console.log('\n--- близнецы по «дата + 3 значимых слова» (все статусы) ---');
const norm = (s) => (s || '').toLowerCase().replace(/[^a-zа-я0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ');
for (const id of IDS) {
  const r = short(id); if (!r) continue;
  const k = norm(r.title_en && r.title_en !== '—' ? r.title_en : r.title);
  const twins = rows.filter(o => o.start_date === r.start_date && norm(o.title_en && o.title_en !== '—' ? o.title_en : o.title) === k);
  console.log(`${r.id.slice(0,8)} «${k}» ${r.start_date}: ${twins.map(t => t.id.slice(0,8) + '(' + t.status + ',' + t.source_type + ')').join(' ')}`);
}
console.log('\nВсего строк в таблице:', rows.length);
