// Точка «События»: адрес для карточек без address, но с координатами.
// Обратное геокодирование Nominatim (OSM). Только те, у кого lat/lng есть.
// По умолчанию сухой прогон. Запись: --apply, размер пачки: --limit=N (по умолч. 20).
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const APPLY = process.argv.includes('--apply');
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 20;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function rows() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db.from('events').select('id,city,address,lat,lng,title_ru,title')
      .eq('status', 'active').is('address', null).order('id').range(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...data); if (data.length < 1000) break;
  }
  return out.filter(e => e.lat != null && e.lng != null && Number.isFinite(+e.lat) && +e.lat !== 0);
}

// Мусорные «места» из OSM: банкоматы/банки/АЗС и пр. — это не адрес события.
const JUNK = /(atm|bank|bureau de change|fuel|petrol|charging|vending|toilets|bench|waste|parking|post_box|pharmacy|clinic)/i;

function fmt(a, city) {
  if (!a) return null;
  const road = [a.road, a.house_number].filter(Boolean).join(' ');
  if (!road) return null;                       // без улицы адрес бесполезен
  const place = a.amenity || a.building || a.tourism || a.shop || a.leisure;
  const parts = [place && !JUNK.test(String(place)) ? place : null, road,
    a.suburb || a.neighbourhood, a.city || a.town || a.village, a.country].filter(Boolean);
  const s = [...new Set(parts)].join(', ');
  if (s.length < 6) return null;
  // Проверка сходимости: город из OSM должен совпадать с городом карточки.
  if (city) {
    const key = String(city).split(',')[0].trim().toLowerCase();
    if (key.length > 2 && !s.toLowerCase().includes(key)) return null;
  }
  return s;
}

const list = await rows();
console.log(`Кандидатов (active, address=null, есть гео): ${list.length}; пачка ${LIMIT}; режим ${APPLY ? 'ЗАПИСЬ' : 'сухой'}`);
let done = 0, miss = 0, fail = 0;
for (const e of list.slice(0, LIMIT)) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${e.lat}&lon=${e.lng}&zoom=18&addressdetails=1&accept-language=ru,en`;
  let addr = null;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'mypins.site events-map address backfill (contact: armagedroid@yandex.ru)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    addr = fmt((await r.json()).address, e.city);
  } catch (err) { fail++; console.log(`  ! ${e.id.slice(0, 8)} ${err.message}`); await sleep(1200); continue; }
  if (!addr) { miss++; console.log(`  - ${e.id.slice(0, 8)} нет улицы в OSM (${e.city})`); }
  else {
    console.log(`  + ${e.id.slice(0, 8)} ${e.city} → ${addr}`);
    if (APPLY) {
      const { error } = await db.from('events').update({ address: addr }).eq('id', e.id);
      if (error) { fail++; console.log('    ОШИБКА записи: ' + error.message); } else done++;
    }
  }
  await sleep(1200);
}
console.log(`Итог: записано ${done}, без улицы ${miss}, ошибок ${fail}`);
