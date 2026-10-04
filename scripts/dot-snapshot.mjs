// Точка «События»: быстрый снимок статусов + очередь модерации (пагинация через selectAll).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,status,start_date,city');
const by = {};
for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
const today = new Date().toISOString().slice(0, 10);
const queue = rows.filter(r => ['moderation', 'needs_changes', 'rejected'].includes(r.status));
const pastQueue = queue.filter(r => (r.start_date || '') < today);
console.log('ВСЕГО', rows.length, JSON.stringify(by));
console.log('ОЧЕРЕДЬ', queue.length, 'из них прошедших', pastQueue.length);
for (const r of queue.slice(0, 15)) console.log(' ', r.status, r.start_date, r.city, r.id.slice(0, 8));
