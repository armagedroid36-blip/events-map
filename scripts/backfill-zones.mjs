// Backfill координат зон: у собранных событий (website = t.me) с адресом-зоной
// («север Нячанга», «район My Gia», «южный пляж») координаты стоят в центре
// города (старый fallback) — переставляем на якорь зоны из city-zones.mjs.
// Только ACTIVE-события; админские/организаторские (website не t.me) не трогаем.
// Запуск: node scripts/backfill-zones.mjs  (DRY_RUN=1 — только план)
import { createClient } from '@supabase/supabase-js';
import { findCityZone, CITY_ZONES } from './city-zones.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';
// Порог «координаты стоят в центре»: евклидово расстояние от fallback-центра.
// 0.02° ≈ 2 км — ловит и старые fallback (12.2388), и «Нячанг север» (12.248).
const CENTER_RADIUS = 0.02;

async function main() {
  const cities = Object.keys(CITY_ZONES);
  const { data, error } = await db
    .from('events')
    .select('id, title, address, city, lat, lng, website')
    .eq('status', 'active')
    .in('city', cities)
    .like('website', 'https://t.me/%') // только автосбор (telegram-каналы)
    .not('address', 'is', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null);
  if (error) throw error;

  let moved = 0;
  let skipped = 0;
  // Адрес, состоящий из сырых координат («16.0428842,108.2518050» — из Google
  // ?q=...): это ТОЧНОЕ место, не зона — такие события не трогаем.
  const rawCoords = /[-+]?\d{1,3}\.\d{3,}\s*[,;]\s*[-+]?\d{1,3}\.\d{3,}/;
  for (const ev of data || []) {
    const center = CITY_ZONES[ev.city].fallback;
    const dLat = ev.lat - center.lat;
    const dLng = ev.lng - center.lng;
    // Координаты далеки от центра — там уже точное/зоновое место, не трогаем
    if (dLat * dLat + dLng * dLng >= CENTER_RADIUS * CENTER_RADIUS) continue;
    if (rawCoords.test(`${ev.address || ''} ${ev.title || ''}`)) {
      skipped++;
      continue;
    }
    const zone = findCityZone(ev.city, `${ev.address || ''} ${ev.title || ''}`);
    // «центр» уже на месте (якорь центра ≈ fallback) — переезд не нужен
    if (!zone || zone.zone === 'center') {
      skipped++;
      continue;
    }
    const { error: uErr } = DRY_RUN
      ? { error: null }
      : await db.from('events').update({ lat: zone.lat, lng: zone.lng }).eq('id', ev.id);
    if (uErr) {
      console.error(`  Ошибка обновления «${String(ev.title).slice(0, 40)}»: ${uErr.message}`);
    } else {
      moved++;
      console.log(
        `  ${DRY_RUN ? '[dry] ' : ''}${ev.city} | ${ev.lat} -> ${zone.lat} | [зона: ${zone.zone}] ${String(ev.address).slice(0, 45)} | ${String(ev.title).slice(0, 35)}`,
      );
    }
  }
  console.log(`Готово: переставлено ${moved}, в центре осталось ${skipped}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
