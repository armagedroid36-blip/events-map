// Проверка разбора страницы Cyprus.BZ: JSON-LD (schema.org/Event) из локально
// сохранённой страницы события. Запуск: node scripts/check-cyprus-bz.mjs <файл.html>
// (используется при отладке источника; в пайплайне не участвует).
import { readFileSync } from 'node:fs';
import { jsonLdEvents } from './collect-cyprus.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Укажите путь к сохранённой HTML-странице события Cyprus.BZ');
  process.exit(1);
}
const html = readFileSync(file, 'utf8');
const events = jsonLdEvents(html);
console.log(`Найдено событий: ${events.length}`);
for (const ev of events) {
  const loc = ev.location || {};
  console.log(JSON.stringify({
    name: ev.name,
    startDate: ev.startDate,
    endDate: ev.endDate,
    place: loc.name,
    city: loc.address?.addressLocality || null,
    url: ev.url,
    images: (Array.isArray(ev.image) ? ev.image : [ev.image]).filter(Boolean).length,
    description: String(ev.description || '').slice(0, 80),
  }, null, 1));
}
