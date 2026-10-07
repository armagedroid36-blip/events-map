// Точка «События»: класс «пост дал ссылку на карту, но координат Google не отдаёт (ftid/имя),
// пин стоит на центровом фолбэке города» — ищем точку площадки у СОСЕДЕЙ в базе.
// Сосед = карточка того же города, в адресе которой названа та же площадка, и её пин НЕ фолбэк.
// Страховки: цель active|moderation, пин ровно на фолбэке, у соседей одна доминирующая точка,
// сдвиг > 200 м, адрес/city цели не переписываются. DRY по умолчанию, APPLY=1 — применять.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const FALLBACKS = { 'Нячанг': [12.2388, 109.1967], 'Дананг': [16.0544, 108.2022] };
const MAP_URL_RE = /https?:\/\/[^\s)\]"'<>]*(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})[^\s)\]"'<>]*/i;
const dist = (a, b, c, d) => Math.hypot((a - c) * 111320, (b - d) * 111320 * Math.cos((a * Math.PI) / 180));
const isFb = (r) => FALLBACKS[(r.city || '').trim()] && Math.abs(r.lat - FALLBACKS[(r.city || '').trim()][0]) <= 0.0012 && Math.abs(r.lng - FALLBACKS[(r.city || '').trim()][1]) <= 0.0012;

const rows = await selectAll(db, 'events', 'id,status,city,address,description,title,lat,lng,start_date', { filter: (q) => q.in('status', ['active', 'moderation']) });
const fbEntries = Object.entries(FALLBACKS);
const cands = rows.filter((r) =>
  r.lat != null && r.city && FALLBACKS[r.city.trim()] && isFb(r) && r.address);
console.log('живых и в очереди:', rows.length, '| кандидатов (пин на фолбэке, адрес есть):', cands.length);

// площадку берём из адреса: первый значимый токен/фраза до запятой или всё поле
const venueOf = (addr) => {
  if (!addr) return null;
  let a = addr.replace(/^\s*(where|где|локация|адрес|место проведения)\s*[:—-]\s*/i, '').split(/[,(]/)[0].trim();
  a = a.replace(/\s+(в|на)\s+\S+$/i, '').trim();
  return a.length >= 4 && a.length <= 60 ? a : null;
};

let applied = 0, skipped = 0, errors = 0;
for (const r of cands) {
  const city = r.city.trim();
  const v = venueOf(r.address);
  if (!v || v.toLowerCase() === city.toLowerCase()) { skipped++; continue; }
  const sibs = rows.filter((o) => o.id !== r.id && (o.city || '').trim() === city && !isFb(o) && o.lat != null && (o.address || '').toLowerCase().includes(v.toLowerCase()));
  // доминирующая точка среди соседей
  const groups = new Map();
  for (const s of sibs) {
    const k = `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  if (!groups.size) { console.log('  соседей с точкой нет:', r.id.slice(0, 8), city, '|', v); skipped++; continue; }
  const [key, cnt] = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  const [la, ln] = key.split(',').map(Number);
  const [fLat, fLng] = FALLBACKS[city];
  const d = dist(fLat, fLng, la, ln);
  console.log(`  ${r.id.slice(0, 8)} ${r.status} ${city} «${v}» соседей ${sibs.length} (доминант ${cnt}) сдвиг ${(d / 1000).toFixed(2)} км -> ${la},${ln}`);
  if (d < 200) { skipped++; continue; }
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ lat: la, lng: ln }).eq('id', r.id).select('id');
  if (error || !data?.length) { console.log('   ошибка записи:', error?.message || 'нет строк'); errors++; } else applied++;
}
console.log(`итог: применено ${applied}, пропущено ${skipped}, ошибок ${errors}${APPLY ? '' : ' (DRY — записи не делались)'}`);
