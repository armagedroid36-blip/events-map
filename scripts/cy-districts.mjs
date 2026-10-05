// Округ/город Кипра по координатам — оффлайн, без сети.
// Полигоны округов упрощены скриптом dot-cy-districts-build.mjs -> scripts/data/cy-districts.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, 'data/cy-districts.json'), 'utf8'));

// Центры населённых пунктов для уточнения внутри округов (округ -> город)
const CENTERS = {
  'Фамагуста': [
    ['Ая-Напа', 34.9886, 33.9997],
    ['Протарас', 35.0128, 34.0564],
    ['Паралимни', 35.0397, 33.9819],
    ['Фамагуста', 35.1200, 33.9430],
  ],
  'Пафос': [
    ['Полис', 35.0363, 32.4255],
    ['Пафос', 34.7754, 32.4245],
  ],
};
const SNAP_KM = 6; // ближе 6 км к центру — считаем этот город
const CITY_RADIUS = { 'Фамагуста': 12, 'Пафос': 14 }; // дальше порога — оставляем имя округа

// Русская метка города -> округ. Нужна, чтобы сверять метку источника с округом точки
// (cyprus.bz даёт «limassol» для площадки в Paliometocho — округ Никосия).
const CITY_DISTRICT = {
  'лимасол': 'Лимасол', 'никосия': 'Никосия', 'ларнака': 'Ларнака', 'лернака': 'Ларнака',
  'пафос': 'Пафос', 'фамагуста': 'Фамагуста', 'ая-напа': 'Фамагуста',
  'протарас': 'Фамагуста', 'паралимни': 'Фамагуста', 'полис': 'Пафос',
};

/** Округ по русской метке города («Лимасол, Кипр» -> «Лимасол») или null. */
export function districtOfCity(city) {
  const key = String(city || '').replace(/,\s*кипр/gi, '').trim().toLowerCase();
  return CITY_DISTRICT[key] || null;
}

const R = 6371;
export function km(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Округ Кипра по координатам или null (вне Республики / вне полигонов). */
export function districtOf(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const d of data.districts) {
    for (const ring of d.rings) if (inRing(lat, lng, ring)) return d.name;
  }
  return null;
}

const FALLBACK_KM = 15; // точка вне полигона Республики (север Фамагусты, база Акротири) — берём ближайший округ

/**
 * Ближайший округ для точки ВНЕ полигонов Республики (северная часть Фамагусты,
 * база Акротири): расстояние до ближайшей вершины упрощённых контуров.
 * Возвращает null, если ближайший округ дальше FALLBACK_KM.
 */
export function districtNear(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null;
  for (const d of data.districts) {
    for (const ring of d.rings) {
      for (const p of ring) {
        const k = km(lat, lng, p[1], p[0]);
        if (!best || k < best.k) best = { name: d.name, k };
      }
    }
  }
  return best && best.k <= FALLBACK_KM ? best.name : null;
}

/** Канонический city для координат: округ + уточнение по ближайшему центру. */
export function cityForPoint(lat, lng) {
  const d = districtOf(lat, lng) || districtNear(lat, lng);
  if (!d) return null;
  const cs = CENTERS[d];
  if (!cs) return d;
  let best = null;
  for (const [name, clat, clng] of cs) {
    const k = km(lat, lng, clat, clng);
    if (!best || k < best.k) best = { name, k };
  }
  if (best.k <= SNAP_KM) return best.name;
  if (best.k <= (CITY_RADIUS[d] ?? 12)) return best.name;
  return d;
}
