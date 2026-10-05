// dot-bali-feed-probe.mjs — «пустой район Бали»: что реально есть в ленте источника (Балифорум)
// по районам, которые на карте пусты. Отвечает на вопрос: пусто из-за источника или из-за сборщика.
// Только чтение: база (selectAll) + страницы API. Ничего не пишет.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,status,website');

const today = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + 120 * 86400e3).toISOString().slice(0, 10);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
const keys = new Set();
const sites = new Map();
for (const r of rows) {
  for (const t of [r.title, r.title_ru]) if (t) keys.add(`${norm(t)}|${r.start_date}`);
  if (r.website) sites.set(r.website, r.start_date);
}

const ADDRESS_DISTRICTS = [
  ['kerobokan', 'Керобокан'], ['ubud', 'Убуд'], ['sayan', 'Убуд'],
  ['penestanan', 'Убуд'], ['lodtunduh', 'Убуд'], ['singakerta', 'Убуд'],
  ['pecatu', 'Печату (Улувату)'], ['uluwatu', 'Печату (Улувату)'],
  ['ungasan', 'Унгасан'], ['jimbaran', 'Джимбаран'],
  ['nusa dua', 'Беноа (Нуса Дуа)'], ['benoa', 'Беноа (Нуса Дуа)'],
  ['tanjung', 'Беноа (Нуса Дуа)'],
  ['canggu', 'Чангу'], ['pererenan', 'Чангу'], ['seminyak', 'Семиньяк'],
  ['legian', 'Легиан'], ['sanur', 'Санур'], ['sukawati', 'Сукавати'],
  ['kediri', 'Табанан'], ['tabanan', 'Табанан'], ['denpasar', 'Денпасар'],
  ['jakarta', 'Джакарта'],
];
const DISTRICTS_RU = {
  ubud: 'Убуд', jimbaran: 'Джимбаран', canggu: 'Чангу', seminyak: 'Семиньяк',
  kuta: 'Кута', sanur: 'Санур', pecatu: 'Печату (Улувату)', uluwatu: 'Печату (Улувату)',
  denpasar: 'Денпасар', 'nusa dua': 'Беноа (Нуса Дуа)', benoa: 'Беноа (Нуса Дуа)',
  tabanan: 'Табанан', amed: 'Амед', sidemen: 'Сидемен', lovina: 'Ловина',
  legian: 'Легиан', kerobokan: 'Керобокан', ungasan: 'Унгасан', sukawati: 'Сукавати',
  'нет в списке': 'Bali',
};

const stat = new Map(); // district -> {future, known, fresh:[]}
const budget = Date.now() + 90000;
const API = 'https://baliforum.ru/api/v1/events';

for (let page = 1; page <= 25; page++) {
  if (Date.now() > budget) { console.log(`[стоп по времени] страниц пройдено ${page - 1}`); break; }
  let list;
  try {
    const r = await fetch(`${API}?defaultList=1&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.log(`стр ${page}: HTTP ${r.status}`); break; }
    list = await r.json();
  } catch (e) { console.log(`стр ${page}: ${e.message}`); break; }
  const events = list.data || [];
  if (!events.length) { console.log(`стр ${page}: пусто (конец ленты)`); break; }
  for (const ev of events) {
    const dates = (ev.eventDates || []).map((d) => String(d.startAt || '').slice(0, 10)).filter((d) => d >= today && d <= horizon).sort();
    if (!dates.length) continue;
    const startDate = dates[0];
    const place = ev.place || {};
    const loc = place.location || {};
    const addressText = String(loc.address || place.title || '').toLowerCase();
    let district = null;
    for (const [needle, canon] of ADDRESS_DISTRICTS) if (addressText.includes(needle)) { district = canon; break; }
    if (!district) {
      const raw = place.districtName || 'Bali';
      district = DISTRICTS_RU[String(raw).trim().toLowerCase()] || raw;
    }
    if (!stat.has(district)) stat.set(district, { future: 0, known: 0, fresh: [] });
    const s = stat.get(district);
    s.future++;
    const title = String(ev.title || '').replace(/&amp;/g, '&');
    const website = `https://baliforum.ru/events/${ev.slug}`;
    const isKnown = keys.has(`${norm(title)}|${startDate}`) || (sites.has(website) && Math.abs((new Date(startDate) - new Date(sites.get(website))) / 86400e3) <= 60);
    if (isKnown) s.known++;
    else if (s.fresh.length < 5) s.fresh.push(`${startDate} ${title.slice(0, 46)} | ${(loc.address || place.districtName || '').slice(0, 40)}`);
  }
}

console.log(`\nБалифорум: сегодня ${today}, горизонт ${horizon}`);
console.log('район | в ленте (будущих) | уже в базе | НОВЫХ');
for (const [d, s] of [...stat.entries()].sort((a, b) => (b[1].future - b[1].known) - (a[1].future - a[1].known))) {
  console.log(`${d.padEnd(22)} ${String(s.future).padStart(4)} | ${String(s.known).padStart(3)} | ${String(s.future - s.known).padStart(3)}`);
}
console.log('\nНовые (не в базе) по «пустым» районам:');
for (const d of ['Денпасар', 'Санур', 'Сидемен', 'Амед', 'Легиан', 'Джимбаран', 'Кута', 'Bali']) {
  const s = stat.get(d);
  if (!s) { console.log(`  ${d}: в ленте нет`); continue; }
  console.log(`  ${d}: новых ${s.future - s.known}`);
  for (const f of s.fresh) console.log(`     ${f}`);
}
