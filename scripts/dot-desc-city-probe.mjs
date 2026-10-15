// Зонд класса «в тексте описания назван ДРУГОЙ город Кипра, чем поле city».
//
// Зачем: агрегаторы (cyprus.bz) копируют в description анонс организатора, и в тексте
// может стоять не тот город, где реально идёт событие (кейс 247: `02fdf8a3`,
// «Ammochostos Cultural Center **in Larnaca**» при city «Фамагуста» и пине 35.0694,33.9586;
// собственная страница площадки на том же bz говорит «Ammochostos Cultural Center, Famagusta»).
// Дефект НЕ в структурных полях карточки (city/адрес/пин верны) — уточнять нечего,
// но класс надо держать на контроле и не путать с законными упоминаниями городов у туров.
//
// Использование: node --env-file=.env scripts/dot-desc-city-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const CITIES = ['Larnaca', 'Limassol', 'Nicosia', 'Paphos', 'Famagusta', 'Λάρνακα', 'Λεμεσό', 'Λευκωσία', 'Πάφο', 'Αμμόχωστο'];
const CITYMAP = {
  larnaca: 'Ларнака', limassol: 'Лимасол', nicosia: 'Никосия', paphos: 'Пафос', famagusta: 'Фамагуста',
  'λάρνακα': 'Ларнака', 'λεμεσό': 'Лимасол', 'λευκωσία': 'Никосия', 'πάφο': 'Пафос', 'αμμόχωστο': 'Фамагуста',
};
// Признаки «тур по острову»: у таких описаний чужие города — норма, а не дефект.
const TOUR_RE = /(tour|across cyprus|all cities|σε όλες τις πόλεις|και σε άλλες πόλεις|& nicosia|and nicosia)/i;

const rows = await selectAll(supabase, 'events', 'id,title,city,address,description,description_ru,status,country',
  { filter: (q) => q.in('status', ['active']).eq('country', 'cyprus') });

const hits = [];
for (const r of rows) {
  const own = (r.city || '').split(',')[0].trim().toLowerCase();
  const ownRu = CITYMAP[own] || (r.city || '').split(',')[0].trim();
  const text = `${r.description || ''} ${r.description_ru || ''}`;
  const wrong = [...new Set(CITIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text)).map((c) => CITYMAP[c.toLowerCase()]))]
    .filter((c) => c && c !== ownRu);
  if (wrong.length) {
    const tour = TOUR_RE.test(text) || (r.title || '').length > 0 && TOUR_RE.test(r.title || '') || wrong.length >= 3;
    hits.push({ id: r.id.slice(0, 8), city: r.city, wrong, tour, title: (r.title || '').slice(0, 70) });
  }
}

const suspicious = hits.filter((h) => !h.tour);
console.log(`Живых кипрских карточек: ${rows.length}`);
console.log(`Упоминают чужой город в описании: ${hits.length} (из них тур-подобных ${hits.length - suspicious.length})`);
console.log(`Требуют проверки (не тур): ${suspicious.length}`);
for (const h of suspicious) console.log(`  ${h.id} | city=${h.city} | в тексте: ${h.wrong.join(',')} | ${h.title}`);
