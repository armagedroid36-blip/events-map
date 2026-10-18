// Зонд «время окончания раньше начала» (норма 0).
// Причина класса: скрипты, сворачивающие интервал источника к одному дню, меняли end_date,
// но оставляли end_time от даты КОНЦА интервала (гастроль/серия) — карточка печатала «19:30 → 19:00».
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const STATUS = (process.env.PROBE_STATUS || 'active,moderation,needs_changes').split(',');
const rows = await selectAll(db, 'events', 'id,title,status,city,start_date,start_time,end_date,end_time,address,website');
const live = rows.filter(r => STATUS.includes(r.status));
const hm = t => (t || '').slice(0, 5);
const bad = live.filter(r => hm(r.start_time) && hm(r.end_time) && r.end_date === r.start_date && hm(r.end_time) < hm(r.start_time));
console.log(`живых (${STATUS.join('/')}) ${live.length} | end_time < start_time в тот же день: ${bad.length}`);
for (const r of bad) console.log(r.id.slice(0, 8), r.status, '|', r.city, '|', r.start_date, hm(r.start_time), '->', hm(r.end_time), '|', r.address, '|', r.title.slice(0, 50), '|', r.website || '');
console.log(bad.length === 0 ? 'НОРМА 0 — ok' : `НОРМА 0 — нарушено ${bad.length}`);
