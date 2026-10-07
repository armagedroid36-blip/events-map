// Зонд класса «адрес карточки = сырые координаты / место сбора» (dot-events).
// Читающий: node --env-file=.env scripts/dot-coord-addr-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const COORD = /^\s*-?\d{1,3}[.,]\d{3,}\s*[;,]?\s*-?\d{1,3}[.,]\d{3,}\s*$/;
const MEET = /(сбор|сборы|место\s+встречи|встречаемся|здесь)(?=[\s,(:.]|$)/i;

const rows = await selectAll(db, 'events', 'id,status,address,city,start_date,website');
const live = rows.filter((r) => r.status === 'active');
const coord = live.filter((r) => r.address && COORD.test(r.address));
const meet = live.filter((r) => r.address && MEET.test(r.address));

console.log(`active ${live.length} | адрес-координаты ${coord.length} | место сбора ${meet.length}`);
for (const r of coord) console.log('  C', r.id.slice(0, 8), r.city, r.start_date, JSON.stringify(r.address), r.website || '');
for (const r of meet) console.log('  M', r.id.slice(0, 8), r.city, r.start_date, JSON.stringify(r.address), r.website || '');
