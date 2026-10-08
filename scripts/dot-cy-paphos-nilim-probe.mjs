// Разведка остатка фолбэка Пафоса: карточки + поиск площадки в ленте Cyprus Now (?q=)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,start_time,website');
const live = rows.filter((r) => (r.status === 'active' || r.status === 'moderation') && r.lat != null && Math.abs(Number(r.lat) - 34.7754) < 0.0005);
console.log('на фолбэке Пафоса 34.7754:', live.length);
for (const r of live) {
  console.log(`--- ${String(r.id).slice(0, 8)} | ${r.start_date} ${r.start_time} | ${r.city} | адрес: ${r.address} | ${r.website}`);
  console.log(`    title: ${r.title}`);
}

const queries = process.argv.slice(2);
for (const q of queries) {
  const url = `https://cyprusnow.app/api/events?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const j = await res.json();
    const evs = j.events || [];
    console.log(`\n=== q=${q} -> ${evs.length}`);
    const seen = new Set();
    for (const e of evs.slice(0, 25)) {
      const v = e.venue || {};
      const key = `${v.name}|${v.lat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`   ${e.startDate || e.start_date || '?'} | ${e.title} | venue: ${v.name} | ${v.city} | ${v.lat},${v.lng}`);
    }
  } catch (e) {
    console.log(`\n=== q=${q} -> ОШИБКА ${e.message}`);
  }
}
