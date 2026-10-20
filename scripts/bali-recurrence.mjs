// Правило повтора для записей Балифорума: у источника серия дат лежит в eventDates[],
// но в карточку recurrence не попадал — карточка получала start_date первой даты и
// archive-past.mjs архивировал её, хотя событие продолжается (клубы, курсы, выставки).
// Возвращает { freq:'daily' } | { freq:'weekly', days:[1..7] } | null.
const DAY = 86400000;

function isoDay(iso) {
  const g = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0=Вс
  return g === 0 ? 7 : g;
}

export function recurrenceOf(dates) {
  if (!Array.isArray(dates)) return null;
  const uniq = [...new Set(dates.map((d) => String(d || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (uniq.length < 3) return null;
  const steps = [];
  for (let i = 1; i < uniq.length; i++) {
    steps.push(Math.round((Date.parse(uniq[i]) - Date.parse(uniq[i - 1])) / DAY));
  }
  if (steps.every((s) => s === 1)) return { freq: 'daily' };
  const days = [...new Set(uniq.map(isoDay))].sort((a, b) => a - b);
  if (steps.every((s) => s > 0 && s % 7 === 0)) return { freq: 'weekly', days };
  // Несколько дней недели (Пн и Чт): шаг между РАЗНЫМИ днями не кратен неделе,
  // поэтому проверяем каждый день недели отдельно — внутри группы шаг обязан быть 7.
  let weekly = false;
  for (const d of days) {
    const own = uniq.filter((x) => isoDay(x) === d);
    for (let i = 1; i < own.length; i++) {
      const gap = Math.round((Date.parse(own[i]) - Date.parse(own[i - 1])) / DAY);
      if (gap % 7 !== 0) return null;
      if (gap === 7) weekly = true;
    }
  }
  return weekly ? { freq: 'weekly', days } : null;
}

export default recurrenceOf;
