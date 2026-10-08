// Перепись живых карточек на центровых фолбэках Кипра (для контроля класса)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,title,city,address,lat,lng,start_date,website');
const live = rows.filter((r) => r.status === 'active' || r.status === 'moderation');
const FALL = { '34.7071': 'Лимасол', '35.1856': 'Никосия', '34.9167': 'Ларнака?', '34.7754': 'Пафос', '34.6802': '?', '35.1699': '?', '34.9182': 'Ларнака', '35.1205': 'Фамагуста' };
const hit = {};
for (const r of live) {
  const k = r.lat != null ? Number(r.lat).toFixed(4) : 'нет';
  if (!FALL[k]) continue;
  hit[k] = hit[k] || [];
  hit[k].push(r);
}
console.log('живых', live.length);
for (const [k, arr] of Object.entries(hit)) {
  console.log(`--- фолбэк ${k} (${FALL[k]}): ${arr.length}`);
  for (const r of arr) console.log(`   ${String(r.id).slice(0, 8)} | ${r.start_date} | ${r.city} | ${r.address} | ${r.title?.slice(0, 50)}`);
}
