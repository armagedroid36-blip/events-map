// Класс-проверка зеркал: живая карточка cyprusnow, стоящая РОВНО на центроиде города (у записи ленты
// нет площадки), у которой есть живой «сосед» на ту же дату (±2 дня) с >=2 общими значимыми словами
// названия и пином в другом месте (>=1 км) — кандидат «одно событие, две афиши, ложный город».
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,title,title_ru,title_en,start_date,start_time,city,address,lat,lng,website');
const live = rows.filter(r => (r.status === 'active' || r.status === 'moderation') && r.lat && r.lng);
const CENTROIDS = [['Никосия', 35.18556590, 33.38227640], ['Лимасол', 34.7071, 33.0226], ['Пафос', 34.7754, 32.4246], ['Ларнака', 34.9182, 33.6194], ['Фамагуста', 35.1205, 33.9432]];
const onCentroid = (r) => CENTROIDS.some(([c, la, ln]) => r.city && r.city.startsWith(c) && Math.abs(r.lat - la) < 0.0005 && Math.abs(r.lng - ln) < 0.0005);
const STOP = new Set(['party', 'show', 'festival', 'night', 'live', 'event', 'cyprus', 'limassol', 'nicosia', 'paphos', 'larnaca', 'bali', 'danang', 'nha', 'trang', 'halloween', 'christmas', 'workshop', 'theatre', 'music', '2026', '2027']);
const words = (r) => {
  const t = `${r.title || ''} ${r.title_ru || ''} ${r.title_en || ''}`.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ');
  return new Set(t.split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
};
const days = (s) => Math.round(new Date(s + 'T00:00:00Z').getTime() / 86400000);
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180)) * 1000;

const cnCentroid = live.filter(r => onCentroid(r) && (r.website || '').includes('cyprusnow'));
let found = 0;
for (const r of cnCentroid) {
  const rw = words(r);
  const sibs = live.filter(s => s.id !== r.id && Math.abs(days(s.start_date) - days(r.start_date)) <= 2 && dist(s, r) > 1000)
    .map(s => { const sw = words(s); const ov = [...rw].filter(w => sw.has(w)); return { s, ov }; })
    .filter(x => x.ov.length >= 2);
  if (sibs.length) {
    found++;
    console.log(`КАНДИДАТ ${r.id.slice(0, 8)} [${r.city}] ${r.start_date} «${(r.title_ru || r.title).slice(0, 45)}» пин на центроиде ${r.lat},${r.lng}`);
    for (const { s, ov } of sibs) console.log(`   sibling ${s.id.slice(0, 8)} [${s.city}] ${s.start_date} ${s.lat},${s.lng} общих слов ${ov.length}: ${ov.join(',')} | ${(s.website || '').slice(0, 55)}`);
  }
}
console.log(`живых с пином ${live.length}; на центроиде CN ${cnCentroid.length}; кандидатов-зеркал ${found}`);
