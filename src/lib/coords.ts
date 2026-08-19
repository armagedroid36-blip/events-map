// Проверка координат события перед отображением на карте.
// Невалидные координаты (по умолчанию, в море, 0,0) не должны рисоваться.
export function isValidCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat == null || lng == null) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
