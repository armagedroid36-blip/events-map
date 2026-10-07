// Точка «События»: пин на центровом фолбэке Нячанга/Дананга — попытка снять его адресом карточки
// через второй источник (Nominatim/OSM). Читающий по умолчанию; APPLY=1 — применять сдвиг > 200 м.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const FALLBACKS = { 'Нячанг': [12.2388, 109.1967, 'Nha Trang'], 'Дананг': [16.0544, 108.2022, 'Da Nang'] };
const dist = (a, b, c, d) => Math.hypot((a - c) * 111320, (b - d) * 111320 * Math.cos((a * Math.PI) / 180));
const UA = 'events-map-dot/1.0 (contact: armagedroid@yandex.ru)';

const rows = await selectAll(db, 'events', 'id,status,city,address,title,lat,lng,start_date,website', { filter: (q) => q.in('status', ['active', 'moderation']) });
const fb = Object.entries(FALLBACKS);
const cands = rows.filter((r) => r.lat != null && r.address && r.address.trim().length > 3 &&
  fb.some(([c, [la, ln]]) => (r.city || '').includes(c) && Math.abs(r.lat - la) <= 0.0012 && Math.abs(r.lng - ln) <= 0.0012));
console.log('живых:', rows.length, '| кандидатов (фолбэк + адрес):', cands.length);

const geo = async (q) => {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&q=${encodeURIComponent(q)}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return (await r.json())[0] || null;
    } catch (e) { /* retry */ }
    await new Promise((s) => setTimeout(s, 1500));
  }
  return { err: 'нет ответа' };
};

let applied = 0, skipped = 0, errors = 0;
for (const r of cands) {
  const [city, [fLat, fLng, enCity]] = fb.find(([c]) => (r.city || '').includes(c));
  const addr = r.address.replace(/^(где|локация|адрес)\s*[:—-]\s*/i, '').trim();
  const hit = await geo(`${addr}, ${enCity}, Vietnam`);
  const tag = `${r.id.slice(0, 8)} ${r.status} ${r.city} ${r.start_date} «${addr.slice(0, 60)}»`;
  if (!hit || hit.err || !hit.lat) { console.log('  нет в OSM:', tag); skipped++; continue; }
  const lat = +hit.lat, lng = +hit.lon;
  const d = dist(fLat, fLng, lat, lng);
  const far = Math.abs(lat - fLat) < 1 || Math.abs(lng - fLng) < 1;
  console.log(`  ${tag} -> ${lat},${lng} (${d.toFixed(0)} м) ${far ? '' : 'ВНЕ ГОРОДА '}[${hit.type}/${hit.display_name?.slice(0, 50)}]`);
  if (!far || d < 200) { skipped++; continue; }
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ lat, lng }).eq('id', r.id).select('id');
  if (error || !data?.length) { console.log('   ошибка записи:', error?.message || 'нет строк'); errors++; } else applied++;
  await new Promise((s) => setTimeout(s, 1100));
}
console.log(`итог: применено ${applied}, пропущено ${skipped}, ошибок ${errors}${APPLY ? '' : ' (DRY)'}`);
