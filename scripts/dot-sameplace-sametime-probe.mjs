// Точка «События»: живые пары «одно место + один день + одно время» — кандидаты в дубли,
// которые штатный дедуп не видит (разные псевдонимы/языки/ссылки). Только чтение.
// Место = пины ближе 150 м ИЛИ одинаковый непустой адрес. Пары с разными названиями выводятся все.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,title_en,start_date,start_time,end_time,city,address,lat,lng,website,photos');
const today = new Date().toISOString().slice(0, 10);
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status) && r.start_date >= today && r.lat != null);
console.log(`живых будущих с пином: ${live.length}`);

const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();

const out = [];
for (let i = 0; i < live.length; i++) {
  for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.start_date !== b.start_date) continue;
    if ((a.start_time || '') !== (b.start_time || '')) continue;
    if ((a.website || '') && a.website === b.website) continue; // одна страница — отдельный известный класс
    const sameAddr = a.address && b.address && norm(a.address) === norm(b.address);
    const near = dist(a, b) <= 150;
    if (!sameAddr && !near) continue;
    out.push({ a, b, near: Math.round(dist(a, b)), sameAddr: !!sameAddr });
  }
}

console.log(`пар «место+день+время»: ${out.length}`);
for (const p of out) {
  console.log(`--- ${p.a.start_date} ${p.a.start_time} | ${p.sameAddr ? 'адрес=адрес' : ''}${p.near ? ` ${p.near}м` : ''}`);
  for (const r of [p.a, p.b]) {
    console.log(`    ${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${(r.title_ru || r.title || '').slice(0, 70)}`);
    console.log(`         адрес: ${(r.address || '—').slice(0, 60)} | пин: ${r.lat},${r.lng} | фото ${(r.photos || []).length}`);
    console.log(`         site: ${(r.website || '—').slice(0, 100)}`);
  }
}
