// Читающий зонд: живые карточки БЕЗ времени начала (start_time null) с будущей датой.
// Печатает срез для сверки со страницей источника.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { writeFileSync } from 'node:fs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,start_time,end_date,end_time,status,website,source_type,address,created_at');
const today = new Date().toISOString().slice(0, 10);
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const out = live.filter((r) => !r.start_time && r.start_date >= today);
out.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
for (const r of out) {
  const host = (() => { try { return new URL(r.website).host; } catch { return '-'; } })();
  console.log([r.id.slice(0, 8), r.start_date, r.city, host, (r.title_ru || r.title || '').slice(0, 45), (r.address || '-').slice(0, 40)].join(' | '));
}
console.log('ИТОГО без start_time (будущие):', out.length, 'живых всего:', live.length);
writeFileSync(process.env.TEMP + '/missing-time.json', JSON.stringify(out, null, 1));
