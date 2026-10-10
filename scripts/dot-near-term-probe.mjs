// Читающий зонд: карточки ближайших N часов (по умолчанию 72) — флаги качества.
// Ищем то, что пользователь видит на карте сейчас: город-адрес (слабый пин),
// отсутствие фото, отсутствие ссылки источника, пин на центровом фолбэке города.
// Использование: node --env-file=.env scripts/dot-near-term-probe.mjs [часов=72]
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const hours = Number(process.argv[2] || 72);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,title,city,address,website,photos,lat,lng,start_date,start_time,end_date,source_type');

// центровые фолбэки городов (для признака «пин на центре города»)
const cts = readFileSync(new URL('./city-zones.mjs', import.meta.url), 'utf8');
const centers = [];
for (const m of cts.matchAll(/([A-Za-z_а-яА-Я0-9]+)\s*:\s*\{\s*lat:\s*(-?[\d.]+)\s*,\s*lng:\s*(-?[\d.]+)/g)) {
  centers.push({ name: m[1], lat: Number(m[2]), lng: Number(m[3]) });
}
const now = new Date();
const from = now.toISOString().slice(0, 10);
const to = new Date(now.getTime() + hours * 3600000);
const toD = to.toISOString().slice(0, 10);

const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const near = live.filter((r) => r.start_date >= from && r.start_date <= toD).sort((a, b) => (a.start_date + a.start_time).localeCompare(b.start_date + b.start_time));
console.log(`окно ${from}..${toD} (${hours} ч) | живых в окне: ${near.length} (живых всего ${live.length})`);

let noPhoto = 0, noWeb = 0, cityAddr = 0, centerPin = 0;
for (const r of near) {
  const flags = [];
  if (!r.photos?.length) { flags.push('нет фото'); noPhoto++; }
  if (!r.website) { flags.push('нет ссылки'); noWeb++; }
  const addr = (r.address || '').trim();
  const cityHead = (r.city || '').split(',')[0].trim();
  if (!addr || addr.toLowerCase() === cityHead.toLowerCase()) { flags.push('адрес=город'); cityAddr++; }
  for (const c of centers) {
    if (Math.abs((r.lat || 0) - c.lat) < 1e-6 && Math.abs((r.lng || 0) - c.lng) < 1e-6) { flags.push(`пин на центре (${c.name})`); centerPin++; break; }
  }
  if (flags.length) console.log(`  ${r.id.slice(0, 8)} ${r.start_date} ${String(r.start_time || '').slice(0, 5)} ${r.city} | ${String(r.title).slice(0, 45)} | ${flags.join(', ')}`);
}
console.log(`итог: без фото ${noPhoto}, без ссылки ${noWeb}, адрес=город ${cityAddr}, пин на центровом фолбэке ${centerPin}`);
