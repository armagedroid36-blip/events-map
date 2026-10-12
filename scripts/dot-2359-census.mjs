// Перепись живых карточек с «время-заглушкой» 23:59 (Балифорум: запись «весь день»).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,city,address,start_date,start_time,end_date,end_time,status,source_type,website');
const live = all.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const stub = live.filter((r) => String(r.start_time || '').startsWith('23:59'));
console.log(`строк ${all.length}, живых ${live.length}, с start_time 23:59 — ${stub.length}`);
for (const r of stub) {
  console.log(`${String(r.id).slice(0, 8)} | ${r.status} | ${r.start_date} ${r.start_time} | ${r.city} | ${r.source_type} | ${(r.website || '').slice(0, 60)} | ${r.title?.slice(0, 60)}`);
}
// сколько таких же «конец 23:59»
const endStub = live.filter((r) => String(r.end_time || '').startsWith('23:59'));
console.log('с end_time 23:59:', endStub.length);
