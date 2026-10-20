// Нормализация ссылки карточки. Источники (VisitCyprus и подобные) отдают «website»
// без схемы («www.famagustatc.com») или с ведущими пробелами. В карточке сайта такая
// строка уходит в href как есть → браузер считает её ОТНОСИТЕЛЬНОЙ и открывает
// https://mypins.site/www.famagustatc.com (404). Поэтому схему добавляем на входе.
export function normWebsite(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  // Схема-независимые значения, которые не станут ссылкой: mailto:, tel:, «нет», «—»
  if (/^(mailto|tel):/i.test(s)) return s;
  // Похоже на домен (есть точка и нет пробелов) → https://
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) return `https://${s}`;
  return s;
}

// «Ссылка на корень сайта» (https://www.cyso.org.cy) — это домашняя страница
// организатора, а не страница события: две РАЗНЫЕ карточки получают один адрес, и
// посетитель не находит там ни даты, ни площадки (класс закрыт на данных 20.10.2026:
// у VisitCyprus поле website = корень организатора, а url = страница события).
export function isRootUrl(value) {
  const s = normWebsite(value);
  if (!s || !/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.pathname === '' || u.pathname === '/') && !u.search && !u.hash;
  } catch {
    return false;
  }
}

// Ссылка карточки: страница организатора, если это страница СОБЫТИЯ; корень сайта
// заменяем страницей события у источника (она есть всегда и содержит дату/площадку).
export function eventWebsite(primary, fallback) {
  const p = normWebsite(primary);
  if (p && !isRootUrl(p)) return p;
  const f = normWebsite(fallback);
  if (f && !isRootUrl(f)) return f;
  return p || f || null;
}
