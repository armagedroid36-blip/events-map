// Класс «одно событие — две афиши с РАЗНЫМИ адресами» (живые дубли, которых не видит штатный дедуп).
// Признак: один день + один город, названия (orig/ru/en) пересекаются по >=2 значимым словам,
// адреса НЕ равны, но пины ближе 1500 м. Именно так выглядит пара из разных источников
// (cyprus.bz RU ↔ cyprusnow EN): адрес записан разными языками ('Технополис 20, Пафос' ↔
// 'Technopolis 20'), ключ title|start_date расходится (RU-перевод ↔ EN-название), а liveDupeMatch
// требует равного адреса и слеп. Разбор пар — в руках точки: пины/даты/зал сверять по страницам
// источников, затем keep/drop в scripts/dot-lang-dupe-fix.mjs (DRY -> APPLY=1).
// Запуск: node --env-file=.env scripts/dot-cross-source-dupe-probe.mjs
// Класс 259: «одно событие — две афиши с РАЗНЫМИ адресами».
// Кандидат: один день + один город, названия пересекаются по >=2 значимым словам,
// адреса РАЗНЫЕ, но пины рядом (< 1500 м) — штатный дедуп такое не видит (liveDupeMatch требует равный адрес).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { STOP as KEY_STOP, FUNC, GENERIC, PLACE_STOP } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,lat,lng,start_date,status,website,source_type');
const STATUSES = (process.env.PROBE_STATUS || 'active').split(',');
const live = all.filter((r) => STATUSES.includes(r.status) && r.lat && r.lng);
// Слова-ТИПЫ и топонимы-«вода» (STOP/FUNC/GENERIC/PLACE_STOP общего ключа дедупа + свои):
// их пересечение НЕ доказывает, что событие одно. Лид 261-262: все оставшиеся кандидаты были
// ложными именно из-за этого — общие слова = тип события (Убуд: «Танцевальные представления
// в храме …» у РАЗНЫХ храмов; Никосия 31.10: разные клубы 360 Bar и Sova Bistrot; Нячанг:
// «ДАЛАТ 17-18 октября» ↔ «РАССТАНОВКИ 18 октября»). Ключ дедупа эти слова уже игнорирует
// (прогон: ложная склейка «Занятие по робототехнике» ↔ «Занятие по рисованию»), поэтому
// зонд обязан считать общими только содержательные слова, иначе он даёт десятки ложных пар.
const stop = new Set([...KEY_STOP, ...FUNC, ...GENERIC, ...PLACE_STOP,
  // типы событий, которых в ключе дедупа нет
  'лекция', 'лекции', 'lecture', 'семинар', 'seminar', 'тренинг', 'конференция', 'conference',
  'concert', 'концерт', 'yoga', 'breakfast', 'завтрак', 'tournament', 'турнир', 'course', 'курс', 'курсы',
  'exhibition', 'выставка', 'выставки', 'ярмарка', 'fair', 'market', 'рынок', 'праздник', 'праздничный',
  'презентация', 'presentation', 'экскурсия', 'excursion', 'прогулка', 'evening', 'morning', 'вечер', 'вечера',
  'игра', 'игры', 'quiz',
  // «музыкальный» тип по тексту
  'песни', 'песня', 'песен', 'songs', 'song', 'τραγούδια', 'τραγούδι']);
// Токены самого ГОРОДА и дни недели: группа уже сгруппирована по городу, поэтому совпадение
// «нячанге»/«trang» внутри пары не доказывает одно событие (Нячанг 17.10: «Литературный клуб
// в Нячанге» ↔ «Флаг-футбол на пляже в Нячанге»), а день недели — тем более («ПЯТНИЦА АВАЛОН.
// Без вариантов» ↔ «BACHATA SENSUAL PARTY ПЯТНИЦА, 16 ОКТЯБРЯ!» — разные вечера одного дня).
const cityTokens = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/);
for (const r of live) for (const t of cityTokens(r.city)) if (t.length > 3) stop.add(t);
for (const w of ['пятница', 'пятницу', 'суббота', 'воскресенье', 'четверг', 'среда', 'вторник', 'понедельник',
  'friday', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) stop.add(w);
const words = (s) => new Set((s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)));
const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const aliases = (r) => [r.title, r.title_ru, r.title_en].filter(Boolean);
const dist = (a, b) => {
  const dx = (a.lat - b.lat) * 111320, dy = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
};
const groups = new Map();
for (const r of live) {
  const k = `${(r.start_date || '').slice(0, 10)}|${norm(r.city)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const shown = [];
for (const [k, g] of groups) {
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    const sa = new Set(), sb = new Set();
    for (const al of aliases(a)) for (const t of words(al)) sa.add(t);
    for (const al of aliases(b)) for (const t of words(al)) sb.add(t);
    const addrTokens = new Set([...norm(a.address).split(' '), ...norm(b.address).split(' ')]);
    const common = [];
    for (const w of sa) if (sb.has(w) && !addrTokens.has(w)) common.push(w);
    const ov = common.length;
    if (ov < 2) continue;
    const addrSame = norm(a.address) === norm(b.address);
    const d = dist(a, b);
    if (!addrSame && d < 1500) {
      shown.push({ k, ov, common, d: Math.round(d), a, b });
    }
  }
}
shown.sort((x, y) => y.ov - x.ov || x.d - y.d);
console.log(`ACTIVE с гео ${live.length}; кандидатов «разный адрес, пины рядом»: ${shown.length}`);
for (const s of shown.slice(0, Number(process.env.PROBE_LIMIT || 25))) {
  console.log(`  ${s.k} | ov ${s.ov} | ${s.d} м | общие: ${s.common.join(', ')}`);
  for (const r of [s.a, s.b]) console.log(`     ${r.id.slice(0, 8)} [${r.source_type}] ${(r.title_ru || r.title).slice(0, 60)} | ${r.address} | ${r.lat},${r.lng} | ${(r.website || '').slice(0, 70)}`);
}
