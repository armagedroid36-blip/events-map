// Генерация scripts/megatix-venue-pins.mjs из замера 941 (проверенные пины площадок).
import fs from 'node:fs';
const dict = JSON.parse(fs.readFileSync(process.env.LOCALAPPDATA + '/Temp/megatix-venue-pins.json', 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/[.,;]/g, ' ').replace(/\s+/g, ' ').trim();
const entries = Object.entries(dict).map(([k, v]) => `  [${JSON.stringify(norm(k))}, { lat: ${v.lat}, lng: ${v.lng} }],`);
const body = `// Словарь «адрес площадки → проверенный пин» для Megatix (запуск 943).
//
// Зачем: у megatix.co.id в JSON-LD нет координат, поэтому сборщик ставил пин на ЦЕНТР РАЙОНА,
// и все события квартала складывались в одну точку (в Убуде так стояли 29 карточек).
// В запуске 941 адреса 39 карточек были геокодированы Nominatim вручную; здесь зафиксированы
// адреса, у которых пин НЕ равен центру района, то есть проверенные площадки.
// Сборщик обязан сначала смотреть сюда и только при промахе падать на центр района.
//
// Обновлять по мере геокодирования новых площадок: источник замера —
// \`status in (active, moderation)\` + \`website ilike *megatix*\`, пин не на центре района.
export const MEGATIX_VENUE_PINS = new Map([
${entries.join('\n')}
]);

/** Нормализация адреса: регистр, пунктуация, повторы пробелов. */
export function normAddr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,;]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

/**
 * Пин площадки по адресу источника.
 * Сначала полное совпадение нормализованного адреса, затем — по улице (первый сегмент адреса),
 * если такая улица в словаре одна. Иначе null (центр района).
 * @param {string} addressText
 * @returns {{lat: number, lng: number} | null}
 */
export function megatixPinForAddress(addressText) {
  const full = normAddr(addressText);
  if (!full) return null;
  const hit = MEGATIX_VENUE_PINS.get(full);
  if (hit) return { lat: hit.lat, lng: hit.lng };

  const street = full.split(',')[0].trim();
  if (street.length < 6) return null;
  const byStreet = [];
  for (const [addr, pin] of MEGATIX_VENUE_PINS) {
    if (addr.split(',')[0].trim() === street) byStreet.push(pin);
  }
  // Улица с несколькими разными пинами — неоднозначно (разные дома), пин не выдумываем.
  const uniq = new Set(byStreet.map((p) => \`\${p.lat},\${p.lng}\`));
  if (uniq.size === 1) return { lat: byStreet[0].lat, lng: byStreet[0].lng };
  return null;
}
`;
fs.writeFileSync('scripts/megatix-venue-pins.mjs', body);
console.log('written, entries', entries.length);
