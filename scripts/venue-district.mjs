// Район (метка города) площадки Бали по «реестру» уже собранных карточек.
//
// Зачем: Балифорум для ОДНОЙ площадки отдаёт разные адресные хвосты
// («…, Seminyak, Kec. Kuta Utara…» у одних событий и «…, Kerobokan Kelod, …»
// у других), а район карточки берётся из адреса (ADDRESS_DISTRICTS). Из-за
// этого одна площадка давала две метки в фильтре по городу
// («Семиньяк, Bali» и «Керобокан, Bali», разобрано в запуске 188).
//
// Арбитр — САМА ПЛОЩАДКА: если у площадки (имя из первого фрагмента адреса +
// точка с точностью ~110 м) уже есть карточки, берём район, который стоит
// у большинства её карточек. Тот же принцип, что у venue-city.mjs для Кипра.
import { venueKey } from './venue-city.mjs';
import { districtFor, OUT_OF_BALI } from './bali-districts.mjs';

const districtOf = (city) => String(city || '').replace(/,\s*bali\s*$/i, '').trim();

// Метки в базе бывают легаси-вариантами («Гианьяр», «Букит», «Улувату»), поэтому
// перед голосованием метку прогоняем через тот же канон, что и сборщик
// (districtFor). «Bali» и «вне Бали» — не голос: это фолбэк, а не район.
const canonDistrict = (raw) => {
  const c = districtFor('', raw);
  return !c || c === 'Bali' || OUT_OF_BALI.has(c) ? null : c;
};

/**
 * Реестр «площадка -> район» по уже собранным карточкам.
 * Возвращает Map(key -> { district, n, total }), district — метка большинства.
 */
export function buildVenueDistrictRegistry(rows) {
  const votes = new Map();
  for (const r of rows || []) {
    const k = venueKey(r.address, r.lat, r.lng);
    const district = canonDistrict(districtOf(r.city));
    if (!k || !district) continue;
    const per = votes.get(k) || new Map();
    per.set(district, (per.get(district) || 0) + 1);
    votes.set(k, per);
  }
  const out = new Map();
  for (const [k, per] of votes) {
    const ranked = [...per.entries()].sort((a, b) => b[1] - a[1]);
    const [district, n] = ranked[0];
    out.set(k, { district, n, total: ranked.reduce((s, [, v]) => s + v, 0) });
  }
  return out;
}

/**
 * Район площадки из реестра или null (тогда остаётся метка из адреса).
 * Страховки: минимум 2 карточки у площадки (одна — случайность) и метка
 * реестра не «вне Бали» (такие случаи разбираются адресом, а не голосованием).
 */
export function districtForVenue({ address, lat, lng }, registry) {
  if (!registry || !registry.size) return null;
  const entry = registry.get(venueKey(address, lat, lng));
  if (!entry || entry.total < 2 || !entry.district) return null;
  if (OUT_OF_BALI.has(entry.district)) return null;
  return entry.district;
}
