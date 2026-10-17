// Точка «События»: класс «ЖИВАЯ копия хуже АРХИВНОЙ».
//
// Событие представлено в базе двумя строками (напр. лента Cyprus Now + страница cyprus.bz).
// Дедуп/архивация оставил живой ту, что стоит на ЦЕНТРОВОЙ КОНСТАНТЕ города, а в архив ушла
// копия с РЕАЛЬНОЙ точкой площадки — на карте пин уезжает на десятки километров, хотя верная
// координата в базе уже есть.
//
// Зонд только читает. Печатает пары: ЖИВАЯ (на константе) ↔ АРХИВ (не на константе), сдвиг >= 1 км,
// тот же ключ title|start_date по любому псевдониму названия (title / title_ru / title_en).
//
// Ручки: PROBE_STATUS=active,moderation (по умолчанию всё, кроме archived), PROBE_MIN_KM (1),
//        PROBE_LIMIT (200 строк вывода).
//
// ПИТФОЛ (наступил в 291): selectAll(db, table, cols, { status: 'active' }) фильтр НЕ применяет
// (четвёртый аргумент — { filter: q => ... }). Читаем всё и фильтруем в JS.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { fileURLToPath } from 'node:url';

// «центровые» точки, которые сборщик ставит, когда у источника нет площадки
// (те же константы, что в dot-geo-stub-probe.mjs / dot-stub-twin-census.mjs)
export const STUB_CENTERS = [
  { lat: 34.7071, lng: 33.0226, city: 'Лимасол' },
  { lat: 34.7754, lng: 32.4245, city: 'Пафос' },
  { lat: 35.1856, lng: 33.3823, city: 'Никосия' },
  { lat: 34.9182, lng: 33.6235, city: 'Ларнака' },
  { lat: 34.9889, lng: 33.9993, city: 'Ая-Напа' },
  { lat: 35.1167, lng: 33.9417, city: 'Фамагуста' },
  { lat: 12.2388, lng: 109.1967, city: 'Нячанг' },
  { lat: 16.0544, lng: 108.2022, city: 'Дананг' },
];

const TOL = 0.0012; // ~130 м: точка считается центровой, только если лежит ровно на константе

export function isStubPin(lat, lng) {
  if (lat == null || lng == null) return null;
  const hit = STUB_CENTERS.find((c) => Math.abs(c.lat - lat) <= TOL && Math.abs(c.lng - lng) <= TOL);
  return hit ? hit.city : null;
}

export function kmBetween(a, b, c, d) {
  const R = 6371;
  const p = Math.PI / 180;
  const x = Math.sin(((c - a) * p) / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(((d - b) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

// Чистая функция: rows -> пары «живая на константе ↔ архивная с реальной точкой»
export function findWorsePairs(rows, { minKm = 1 } = {}) {
  const byKey = new Map();
  for (const r of rows) {
    if (!r.start_date || r.lat == null || r.lng == null) continue;
    const titles = new Set([r.title, r.title_ru, r.title_en].filter(Boolean).map(norm));
    for (const t of titles) {
      if (!t) continue;
      const k = t + '|' + r.start_date;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
  }
  const seen = new Set();
  const pairs = [];
  for (const grp of byKey.values()) {
    const live = grp.filter((r) => r.status !== 'archived');
    const arch = grp.filter((r) => r.status === 'archived');
    if (!live.length || !arch.length) continue;
    for (const L of live) {
      const lStub = isStubPin(L.lat, L.lng);
      if (!lStub) continue;
      for (const A of arch) {
        if (isStubPin(A.lat, A.lng)) continue;
        const d = kmBetween(L.lat, L.lng, A.lat, A.lng);
        if (d < minKm) continue;
        const sig = L.id + '|' + A.id;
        if (seen.has(sig)) continue;
        seen.add(sig);
        pairs.push({ live: L, arch: A, km: d, stubCity: lStub });
      }
    }
  }
  pairs.sort((a, b) => b.km - a.km);
  return pairs;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const rows = await selectAll(
    db,
    'events',
    'id,title,title_ru,title_en,city,address,lat,lng,status,start_date,start_time,website',
  );
  const allowed = process.env.PROBE_STATUS ? process.env.PROBE_STATUS.split(',').map((s) => s.trim()) : null;
  const scoped = allowed ? rows.filter((r) => allowed.includes(r.status) || r.status === 'archived') : rows;
  const minKm = Number(process.env.PROBE_MIN_KM || 1);
  const limit = Number(process.env.PROBE_LIMIT || 200);
  const pairs = findWorsePairs(scoped, { minKm });
  const liveScoped = scoped.filter((r) => r.status !== 'archived').length;
  console.log(`живых ${liveScoped} | архивных ${scoped.filter((r) => r.status === 'archived').length} | кандидатов ${pairs.length}`);
  for (const p of pairs.slice(0, limit)) {
    const L = p.live;
    const A = p.arch;
    console.log(
      `[${p.km.toFixed(2)} км] ЖИВАЯ ${L.status} ${L.id.slice(0, 8)} ${L.city} ${L.lat},${L.lng} (центр ${p.stubCity}) | ${(L.title_ru || L.title || '').slice(0, 70)}`,
    );
    console.log(`           АРХИВ ${A.id.slice(0, 8)} ${A.city} ${A.lat},${A.lng} | адрес Ж: ${L.address || '—'} | адрес А: ${A.address || '—'}`);
  }
}
