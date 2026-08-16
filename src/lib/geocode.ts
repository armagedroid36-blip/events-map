// Геокодинг адреса в координаты через OpenStreetMap Nominatim.
// Бесплатно, без ключа. Лимит: 1 запрос в секунду — запросы выстраиваются в очередь.
import { config } from '../config';

let lastRequest = 0;

/** Перевод адреса в координаты. Возвращает null, если адрес не найден. */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;

  // Соблюдаем лимит Nominatim: не чаще 1 запроса в секунду
  const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  try {
    const url = `${config.nominatimUrl}?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/**
 * Обратный геокодинг: координаты -> адрес и город.
 * Нужен, когда организатор тыкает по карте — адрес заполняется сам.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string } | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  try {
    const url = `${config.nominatimUrl}?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; state?: string };
    };
    if (!d.display_name) return null;
    const city = d.address?.city || d.address?.town || d.address?.village || d.address?.state || '';
    return { address: d.display_name, city };
  } catch {
    return null;
  }
}
