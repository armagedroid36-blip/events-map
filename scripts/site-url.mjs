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
