// Чистая функция класса «окно тура/серии накрывает отдельные даты — это НЕ дубль записи».
// Зонд dot-cn-same-venue-probe до 336 помечал такие группы как «ДЕФЕКТ НА КАРТЕ», хотя это
// законная серия: одна интервальная запись ленты CN (окно тура) + записи по конкретным вечерам.
// Признак настоящего дубля — две записи с ОДНОЙ датой начала либо пересечение без окна-контейнера.
export function isWindowSeries(tl) {
  if (!Array.isArray(tl) || tl.length < 2) return false;
  const starts = tl.map((r) => String(r.start || '').slice(0, 10));
  if (starts.some((s) => !s)) return false;
  // две записи с одной датой начала — возможен дубль одного вечера, окном не объяснить
  if (new Set(starts).size !== starts.length) return false;
  const sorted = [...tl].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const first = sorted[0];
  if (!first.end) return false;
  const fS = String(first.start).slice(0, 10);
  const fE = String(first.end).slice(0, 10);
  if (fE <= fS) return false; // не интервал
  return sorted.slice(1).every((r) => {
    const d = String(r.start).slice(0, 10);
    return d >= fS && d <= fE;
  });
}
