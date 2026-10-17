// Точка «События»: перепись карточек РОВНО на центровых константах городов
// с поиском арбитра «двойник в базе» — другие карточки той же площадки,
// которые стоят НЕ на константе (приём, закрывший 7 карточек в 281–282).
// Только чтение. Ручки: PROBE_STATUS=active,moderation PROBE_MINCHAR=6
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,source_type');
const STATUSES = (process.env.PROBE_STATUS || 'active').split(',').map((s) => s.trim());
const MINCHAR = Number(process.env.PROBE_MINCHAR || 6);

const STUBS = {
  '34.7071,33.0226': 'Лимасол',
  '34.7754,32.4245': 'Пафос',
  '35.1856,33.3823': 'Никосия',
  '34.9182,33.6194': 'Ларнака',
  '34.9889,33.9993': 'Ая-Напа',
  '35.1167,33.9417': 'Фамагуста',
  '12.2388,109.1967': 'Нячанг',
  '16.0544,108.2022': 'Дананг',
};
const TOL = 0.00015;
const stubOf = (r) => {
  if (!r.lat || !r.lng) return null;
  for (const k of Object.keys(STUBS)) {
    const [la, ln] = k.split(',').map(Number);
    if (Math.abs(r.lat - la) <= TOL && Math.abs(r.lng - ln) <= TOL) return STUBS[k];
  }
  return null;
};

const CITYWORDS = /(кипр|cyprus|bali|бали|индонезия|indonesia|vietnam|вьетнам|город|district)/g;
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[«»"'`]/g, ' ')
  .replace(/[^\p{L}\p{N} ]+/gu, ' ')
  .replace(CITYWORDS, ' ')
  .replace(/\s+/g, ' ').trim();
// ключ = имя ГОРОДА, а не площадки, арбитром быть не может (питфол 277/282:
// адрес уровня города даёт десятки «двойников» из чужих событий)
const CITYKEYS = new Set(['лимасол', 'никосия', 'ларнака', 'пафос', 'ая напа', 'фамагуста', 'нячанг', 'дананг',
  'протарас', 'паралимни', 'limassol', 'nicosia', 'larnaca', 'paphos', 'ayia napa', 'famagusta', 'nha trang', 'da nang']);
// ключ площадки = первый сегмент адреса (до запятой), без города/типовых слов
const venueKey = (a) => {
  const seg = String(a || '').split(',')[0];
  const n = norm(seg);
  if (n.length < MINCHAR || CITYKEYS.has(n)) return '';
  return n;
};
const km = (a, b, c, d) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLa = rad(c - a), dLn = rad(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const live = rows.filter((r) => STATUSES.includes(r.status) && r.lat && r.lng);
const stubs = live.filter((r) => stubOf(r));
console.log('живых в статусах', STATUSES.join('/'), '=', live.length, '| из них на центровых константах =', stubs.length);
const byCity = {};
for (const s of stubs) byCity[stubOf(s)] = (byCity[stubOf(s)] || 0) + 1;
console.log('по городам:', JSON.stringify(byCity));

const withTwin = [];
const noTwin = [];
for (const s of stubs) {
  const k = venueKey(s.address);
  if (!k) { noTwin.push({ ...s, why: 'адрес пуст/не название площадки' }); continue; }
  const twins = live.filter((o) => {
    if (o.id === s.id || stubOf(o)) return false;
    const ok = venueKey(o.address);
    if (!ok) return false;
    return ok === k || ok.includes(k) || k.includes(ok);
  });
  if (!twins.length) { noTwin.push({ ...s, why: 'двойника нет (ключ: ' + k + ')' }); continue; }
  // мода координат двойников
  const cnt = new Map();
  for (const t of twins) {
    const ck = Number(t.lat).toFixed(5) + ',' + Number(t.lng).toFixed(5);
    cnt.set(ck, (cnt.get(ck) || 0) + 1);
  }
  const [best, n] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const [la, ln] = best.split(',').map(Number);
  withTwin.push({ s, k, twins: twins.length, best: [la, ln], votes: n, shift: km(s.lat, s.lng, la, ln), statuses: [...new Set(twins.map((t) => t.status))].join('/') });
}
console.log('\n== С АРБИТРОМ «двойник в базе»:', withTwin.length);
for (const w of withTwin) {
  console.log(w.s.id.slice(0, 8), '|', w.s.status, '|', stubOf(w.s), '|', (w.s.title_ru || w.s.title || '').slice(0, 48),
    '| ключ:', w.k.slice(0, 40), '| двойников', w.twins, '(' + w.statuses + ')', '| точка', w.best.join(','), '| сдвиг', w.shift.toFixed(2), 'км');
}
console.log('\n== БЕЗ АРБИТРА:', noTwin.length);
for (const w of noTwin) console.log(w.id.slice(0, 8), '|', w.status, '|', stubOf(w), '|', (w.title_ru || w.title || '').slice(0, 44), '|', w.why);
