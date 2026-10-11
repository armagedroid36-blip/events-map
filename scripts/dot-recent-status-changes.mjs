// Точка «События»: кто менял карточки за последние часы (решения владельца в админке,
// публикации автопроверки) — только чтение.
// Использование: node --env-file=.env scripts/dot-recent-status-changes.mjs [ISO-время | 12h]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const arg = process.argv[2] || '6h';
const since = /^\d+h$/.test(arg)
  ? new Date(Date.now() - Number(arg.slice(0, -1)) * 3600 * 1000).toISOString()
  : arg;

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,start_date,start_time,city,address,lat,lng,source_type,website,photos,auto_review,created_at,updated_at');
const changed = rows
  .filter((r) => (r.updated_at || '') >= since)
  .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

console.log(`Изменённые с ${since}: ${changed.length} | всего строк ${rows.length}`);
const byStatus = {};
for (const r of changed) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('по статусам:', JSON.stringify(byStatus));
for (const r of changed) {
  const ar = r.auto_review || {};
  const created = (r.created_at || '') >= since ? 'НОВАЯ' : 'правка/статус';
  console.log('---', r.updated_at, '|', r.status, '|', created, '|', r.id.slice(0, 8), '|', r.city, r.start_date, r.start_time || '');
  console.log('    ', (r.title_ru || r.title || '').slice(0, 90));
  console.log('     адрес:', (r.address || '—').slice(0, 70), '| пин:', r.lat != null ? `${r.lat},${r.lng}` : '—', '| фото:', (r.photos || []).length);
  console.log('     вердикт:', ar.verdict || ar.status || ar.decision || '—', '| причина:', String(ar.reason || ar.notes || ar.message || '').slice(0, 140));
  console.log('     site:', (r.website || '—').slice(0, 110));
}
