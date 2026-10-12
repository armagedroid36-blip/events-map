// Город площадки по «реестру» уже собранных карточек.
//
// Зачем: агрегатор Cyprus Now в поле city для ОДНОЙ и той же площадки отдаёт
// разные значения (Fyti Village Square: у части записей «Paphos», у части
// «Polis», venue.city «Fyti»; Castle Club в Ая-Напе: у одной записи
// «famagusta»). Из-за этого фильтр по городу на карте расщепляется —
// одна площадка выглядит как два разных города.
//
// Округ-арбитр тут НЕ работает: Полис и Пафос лежат в одном округе Пафос,
// Ая-Напа законно лежит в округе Фамагуста (метка «Ая-Напа» верна).
// Поэтому арбитр — САМА ПЛОЩАДКА: если событие той же площадки (имя + точка)
// уже стоит на карте, берём метку города большинства её карточек.
import { districtOfCity } from './cy-districts.mjs';

/** Ключ площадки: имя из первого фрагмента адреса + точка с точностью ~110 м. */
export function venueKey(address, lat, lng) {
  const name = String(address || '')
    .split(',')[0]
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || lat == null || lng == null) return null;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return `${name}|${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

const bare = (city) => String(city || '').replace(/,\s*кипр/gi, '').trim();

/**
 * Реестр «площадка -> город» по уже собранным карточкам (живым и архивным).
 * Возвращает Map(key -> { city, n, total }), где city — метка большинства.
 */
export function buildVenueCityRegistry(rows) {
  const votes = new Map();
  for (const r of rows || []) {
    const k = venueKey(r.address, r.lat, r.lng);
    const city = bare(r.city);
    if (!k || !city) continue;
    const per = votes.get(k) || new Map();
    per.set(city, (per.get(city) || 0) + 1);
    votes.set(k, per);
  }
  const out = new Map();
  for (const [k, per] of votes) {
    const ranked = [...per.entries()].sort((a, b) => b[1] - a[1]);
    const [city, n] = ranked[0];
    out.set(k, { city, n, total: ranked.reduce((s, [, v]) => s + v, 0) });
  }
  return out;
}

/**
 * Метка города для площадки из реестра или null.
 * Страховки: минимум 2 карточки у площадки (одна — случайность) и метка
 * реестра не противоречит округу точки (если округ точки известен).
 */
export function cityForVenue({ address, lat, lng }, registry, pointDistrict) {
  if (!registry || !registry.size) return null;
  const entry = registry.get(venueKey(address, lat, lng));
  if (!entry || entry.total < 2) return null;
  if (pointDistrict && districtOfCity(entry.city) && districtOfCity(entry.city) !== pointDistrict) return null;
  return entry.city;
}
