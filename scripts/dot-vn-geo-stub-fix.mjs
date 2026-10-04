// Класс «пин в центре города» (Нячанг/Дананг): адрес источника называет площадку/улицу,
// а точка стоит на центровом fallback сборщика. Геокодер: 1) точное совпадение имени в OSM
// (OVERRIDES — проверенные объекты), 2) Nominatim по улице из адреса источника.
// DRY по умолчанию, APPLY=1 — писать. node --env-file=.env scripts/dot-vn-geo-stub-fix.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const CITIES = [
  { name: 'Нячанг', en: 'Nha Trang', lat: 12.2388, lng: 109.1967 },
  { name: 'Дананг', en: 'Da Nang', lat: 16.0544, lng: 108.2022 },
];
const NEAR = 0.0008;

// Проверенные объекты OSM: имя площадки из источника -> точка объекта (name-match).
const OVERRIDES = {
  '513d9371': { lat: 16.0688447, lng: 108.2207425, why: 'OSM theatre «Nhà hát Trưng Vương» (источник: Trung Vuong Theatre)' },
};

// Адрес уровня города / «где-то» — геокодить нечего.
const VAGUE = [/уточня/i, /при записи/i, /регистр/i, /км от/i, /мост/i];
const isVague = (addr, city) => !addr || !addr.trim() || addr.trim() === city || VAGUE.some((r) => r.test(addr));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b, c, d) => {
  const R = 6371, t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const UA = 'mypins-events-map/1.0 (contact: armagedroid@yandex.ru)';

// «улица» из адреса источника: часть с Đ./Đường/Street + номер дома или переулка
function streetQuery(addr, cityEn) {
  const a = addr.replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ');
  const m = a.match(/(?:Hẻm\s*)?(\d+[A-Za-zА-Яа-я]*\s*)?(?:Đ\.|Đường|Duong|Street|St\.)\s*([^,]+)/i);
  const name = m ? m[2] : a.split(',').find((p) => /^[^,]*[àáảãạăâđêôơưeiyo]/i.test(p) && !/^\d{6}/.test(p) && p.trim().length > 4 && !/Вьетнам|Vietnam|Khánh|Bắc/i.test(p));
  if (!name) return null;
  return `${(m?.[1] || '').trim()} ${name.trim()}, ${cityEn}, Vietnam`.trim();
}

async function geocode(q) {
  const u = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=3`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (i === 2) return null; await sleep(2000); }
  }
}

const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,status,website');
let moved = 0, skip = 0, fail = 0;
for (const c of CITIES) {
  const rows = all.filter((r) => r.status === 'active' && r.lat != null && Math.abs(r.lat - c.lat) < NEAR && Math.abs(r.lng - c.lng) < NEAR);
  console.log(`=== ${c.name}: на центровой точке ${rows.length}`);
  for (const r of rows) {
    const id8 = r.id.slice(0, 8);
    let target = OVERRIDES[id8] ? { lat: OVERRIDES[id8].lat, lng: OVERRIDES[id8].lng, src: OVERRIDES[id8].why } : null;
    if (!target) {
      if (isVague(r.address, c.name)) { console.log(`  — ${id8} ${r.address || 'АДРЕС=НЕТ'} | геокодить нечего`); skip++; continue; }
      const q = streetQuery(r.address, c.en);
      if (!q) { console.log(`  — ${id8} ${r.address.slice(0, 40)} | улица не выделяется`); skip++; continue; }
      const res = await geocode(q);
      await sleep(1100);
      const hit = Array.isArray(res) ? res.find((h) => dist(c.lat, c.lng, +h.lat, +h.lon) < 6) : null;
      if (!hit) { console.log(`  ! ${id8} улица не найдена: ${q}`); fail++; continue; }
      target = { lat: +hit.lat, lng: +hit.lon, src: `Nominatim: ${hit.display_name.slice(0, 55)}` };
    }
    const km = dist(r.lat, r.lng, target.lat, target.lng);
    if (km < 0.4) { console.log(`  = ${id8} уже на месте (${(km * 1000) | 0} м)`); skip++; continue; }
    console.log(`  + ${id8} СДВИГ ${km.toFixed(1)} км -> ${target.lat.toFixed(6)},${target.lng.toFixed(6)} | ${target.src}`);
    if (APPLY) {
      const { data, error } = await db.from('events').update({ lat: target.lat, lng: target.lng }).eq('id', r.id).select('id,lat,lng');
      if (error || !data?.length) { console.log(`     ОШИБКА: ${error?.message || '0 строк'}`); fail++; continue; }
      moved++;
    } else moved++;
  }
}
console.log(`\n${APPLY ? 'ПРИМЕНЕНО' : 'СУХОЙ ПРОГОН'}: сдвинуто ${moved}, пропущено ${skip}, не найдено ${fail}`);
