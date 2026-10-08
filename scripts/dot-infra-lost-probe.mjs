// Карточки, «потерянные» из-за инфраструктурного отказа LLM-судьи: статус, дата, можно ли вернуть.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,created_at,title,city,start_date,end_date,website,lat,lng,address,auto_review', { filter: q => q.not('auto_review', 'is', null) });
const today = new Date().toISOString().slice(0, 10);
const infra = rows.filter(r => { const ar = r.auto_review; const reason = typeof ar === 'object' && ar ? String(ar.reason || '') : String(ar || ''); return /400|hex escape|не ответил|timeout|ECONN|fetch failed/i.test(reason); });
console.log('Строк с auto_review:', rows.length, '| инфраструктурных:', infra.length, '| сегодня', today);
for (const r of infra.sort((a,b)=>String(a.status).localeCompare(String(b.status)))) {
  const ar = r.auto_review || {};
  const future = (r.end_date || r.start_date || '') >= today;
  console.log(`${r.id.slice(0,8)} [${r.status}] ${r.start_date}..${r.end_date||'-'} future=${future} geo=${r.lat?1:0} addr=${r.address?1:0} ${String(r.title).slice(0,45)}`);
  console.log('   verdict=', ar.verdict, '|', String(ar.reason||'').slice(0,150));
  console.log('   web=', r.website);
}
