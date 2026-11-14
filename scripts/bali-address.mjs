// Санитайзер адреса для сборщика Бали: не пускает в базу «адрес-заглушку»
// (только страна/остров, «Unknown», пустая строка) — тот же класс, что закрыт
// в collect-cyprus.mjs (cardAddress).
//
// ВАЖНО: address входит в ключ дедупа `city|title+address`. Поэтому функция
// НИЧЕГО не нормализует в настоящем адресе (не срезает хвостовую страну,
// не убирает повторы частей) — иначе ключ разойдётся с уже собранными строками
// и следующий сбор родит дубли. Правило ровно одно: если содержательной части
// не осталось вовсе — заглушка, возвращаем фолбэк; иначе отдаём адрес как есть.

const STUB = new Set([
  'bali', 'бали', 'indonesia', 'индонезия', 'republic of indonesia',
  'island of bali', 'pulau bali', 'unknown', 'n/a', 'na', '-', '—', 'null',
]);

export function isStubAddressPart(part) {
  const s = String(part || '')
    .replace(/\s+/g, ' ')
    .replace(/[.;]+$/g, '')
    .trim()
    .toLowerCase();
  return !s || STUB.has(s);
}

/**
 * @param {string} raw       адрес источника
 * @param {string} fallback  канон места («Убуд, Bali»); сам тоже проверяется
 * @returns {string|null}
 */
export function cardAddressBali(raw, fallback = null) {
  const value = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!value) return null; // пустой адрес — норма (не выдумываем)

  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  const informative = parts.some((p) => !isStubAddressPart(p));
  if (informative) return value; // настоящий адрес не трогаем (ключ дедупа)

  const fb = String(fallback || '').replace(/\s+/g, ' ').trim();
  return fb && !isStubAddressPart(fb) ? fb : null;
}
