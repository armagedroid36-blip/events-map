// dot-latsia-probe.mjs — карточки Latsia + embed-координата со страницы cyprus.bz (прокси 10809)
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const PROXY = 'http://127.0.0.1:10809';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,start_time,website');
const hits = rows.filter(r => /latsia|λατσι|latsi|силва|silva/i.test(`${r.address || ''} ${r.title || ''} ${r.title_ru || ''}`));
console.log('карточек Latsia:', hits.length);
for (const r of hits) console.log(`--- ${r.id} [${r.status}] ${r.title_ru || r.title} | ${r.start_date} ${r.start_time || ''} | city=${r.city} | adr=${r.address} | geo=${r.lat},${r.lng} | ${r.website}`);

function page(url) {
  try { return execFileSync('curl', ['-s', '-L', '-m', '25', '--proxy', PROXY, url], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8'); } catch { return ''; }
}
for (const r of hits.filter(x => x.status === 'active')) {
  const html = page(r.website);
  const m = html.match(/maps\/embed\/v1\/place[^"']*?q=([-0-9.]+)(?:%2C|,)([-0-9.]+)/i) || html.match(/[?&]q=([-0-9.]+)%2C([-0-9.]+)/i);
  const lats = (html.match(/[Ll]atsia[^<"]{0,90}/g) || []).slice(0, 3);
  const silva = (html.match(/[Ss]ilva[^<"]{0,90}/g) || []).slice(0, 3);
  console.log(`PAGE ${r.id} size=${html.length} embed=${m ? m[1] + ',' + m[2] : 'НЕТ'}`);
  console.log('   latsia:', JSON.stringify(lats));
  console.log('   silva:', JSON.stringify(silva));
}
