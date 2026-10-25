// Backfill координат зон: у собранных событий (website = t.me) с адресом-зоной
// («север Нячанга», «район My Gia», «южный пляж») координаты стоят в центре
// города (старый fallback) — переставляем на якорь зоны из city-zones.mjs.
// Только ACTIVE-события; админские/организаторские (website не t.me) не трогаем.
// Запуск: node scripts/backfill-zones.mjs  (DRY_RUN=1 — только план)
import { createClient } from '@supabase/supabase-js';
import { findEventZone, CITY_ZONES } from './city-zones.mjs';

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

// Текст поста тоже называет часть города, но зону по тексту отдаёт findEventZone
// (city-zones.mjs): сначала адрес/название, потом строки поста про место.

async function main() {
  const cities = Object.keys(CITY_ZONES);
  const { data, error } = await db
    .from('events')
    .select('id, title, address, description, city, lat, lng, website')
    .eq('status', 'active')
    .in('city', cities)
    .like('website', 'https://t.me/%') // только автосбор (telegram-каналы)
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
    const zone = findEventZone(ev.city, ev);
    if (!zone) {
      skipped++;
      continue;
    }
    // Уже стоит на якоре зоны (пляж лежит внутри допуска центра) — не дёргаем
    if (Math.abs(ev.lat - zone.lat) < 1e-5 && Math.abs(ev.lng - zone.lng) < 1e-5) {
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
        `  ${DRY_RUN ? '[dry] ' : ''}${ev.city} | ${ev.lat},${ev.lng} -> ${zone.lat},${zone.lng} | [зона: ${zone.zone}] ${String(ev.address || '(без адреса)').slice(0, 45)} | ${String(ev.title).slice(0, 35)}`,
      );
    }
  }
  console.log(`Готово: переставлено ${moved}, в центре осталось ${skipped}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
