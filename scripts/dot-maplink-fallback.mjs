// Точка «События»: класс «пост дал ссылку на карту, а пин стоит на центровом фолбэке города».
// Резолвит ссылку поста (resolveMap) и, если получились координаты, ставит пин по ним.
// Страховки: карточка active|moderation, пин РОВНО на фолбэке города, ссылка на карту есть,
// координаты отличаются > 200 м и лежат в пределах 0.5° от фолбэка, адрес не переписывается.
// DRY по умолчанию, APPLY=1 — применять.  Читающий без APPLY.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
process.env.COLLECT_TG_NO_RUN = '1';
const { resolveMap } = await import('./collect-tg.mjs');

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const FALLBACKS = {
  'Нячанг': [12.2388, 109.1967],
  'Дананг': [16.0544, 108.2022],
};
const MAP_URL_RE = /https?:\/\/[^\s)\]"'<>]*(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})[^\s)\]"'<>]*/i;
const dist = (a, b, c, d) => Math.hypot((a - c) * 111320, (b - d) * 111320 * Math.cos((a * Math.PI) / 180));

const rows = await selectAll(db, 'events', 'id,status,city,address,description,title,lat,lng,start_date', { filter: (q) => q.in('status', ['active', 'moderation']) });
const fb = Object.entries(FALLBACKS);
const cands = rows.filter((r) =>
  r.lat != null && MAP_URL_RE.test(`${r.description || ''}\n${r.address || ''}`) &&
  fb.some(([city, [la, ln]]) => (r.city || '').includes(city) && Math.abs(r.lat - la) <= 0.0012 && Math.abs(r.lng - ln) <= 0.0012));
console.log('живых и в очереди:', rows.length, '| кандидатов (пин на фолбэке + ссылка на карту):', cands.length);

let applied = 0, skipped = 0, errors = 0;
for (const r of cands) {
  const url = (`${r.description || ''}\n${r.address || ''}`.match(MAP_URL_RE) || [''])[0].replace(/[.,;]+$/, '');
  if (!url) { skipped++; continue; }
  const g = await resolveMap(url);
  if (g.lat == null) { console.log('  нет координат по ссылке:', r.id.slice(0, 8), r.city, url.slice(0, 50)); skipped++; continue; }
  const [fCity, [fLat, fLng]] = fb.find(([c]) => (r.city || '').includes(c));
  const d = dist(fLat, fLng, g.lat, g.lng);
  const near = Math.abs(g.lat - fLat) < 0.5 && Math.abs(g.lng - fLng) < 0.5;
  console.log(`  ${r.id.slice(0, 8)} ${r.status} ${r.city} ${r.start_date} сдвиг ${(d / 1000).toFixed(2)} км -> ${g.lat},${g.lng} ${near ? '' : 'ВНЕ ОКРЕСТНОСТИ ГОРОДА'}`);
  if (!near || d < 200) { skipped++; continue; }
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ lat: g.lat, lng: g.lng }).eq('id', r.id).select('id');
  if (error || !data?.length) { console.log('   ошибка записи:', error?.message || 'нет строк'); errors++; } else applied++;
}
console.log(`итог: применено ${applied}, пропущено ${skipped}, ошибок ${errors}${APPLY ? '' : ' (DRY — записи не делались)'}`);
