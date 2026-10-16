// Класс «одно событие — две живые карточки с РАЗНЫМ ВРЕМЕНЕМ» (лид 260-269: Mother of Millions
// 28.11 Ларнака: bz 22:00 против ленты CN 21:00; Pame Kaimakli 24.10: bz 16:00 против CN 20:00;
// Angelo Tsarouhas 16.10: 21:00 у обеих — совпало).
// Признак кандидата: один день + один город, названия (orig/ru/en) пересекаются по >=2
// СОДЕРЖАТЕЛЬНЫМ словам (стоп-лист типов событий + топонимы-«вода» из общего ключа дедупа),
// у обеих карточек есть start_time и они РАЗНЫЕ, а пины ближе 1500 м.
// Штатный дедуп и зонд «разных адресов» такое не видят: ключ title|start_date расходится
// переводом названия, liveDupeMatch требует равного адреса и дня.
// Запуск: node --env-file=.env scripts/dot-time-mismatch-probe.mjs
// Ручки: PROBE_STATUS=active,archived | PROBE_LIMIT=N (сколько пар печатать, по умолчанию 40)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { STOP, FUNC, GENERIC, PLACE_STOP, norm, cityKey, distanceM } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,lat,lng,start_date,start_time,status,website,source_type');
const STATUSES = (process.env.PROBE_STATUS || 'active').split(',');
const LIMIT = Number(process.env.PROBE_LIMIT || 40);
const live = all.filter((r) => STATUSES.includes(r.status) && typeof r.lat === 'number' && typeof r.lng === 'number');

// Стоп-лист: слова-ТИПЫ событий (пересечение по ним НЕ доказывает одно событие) + типовые
// топонимы-«вода» из общего ключа дедупа.
const stop = new Set([...STOP, ...FUNC, ...GENERIC, ...PLACE_STOP,
  'лекция', 'лекции', 'lecture', 'семинар', 'seminar', 'тренинг', 'конференция', 'conference',
  'concert', 'концерт', 'концерты', 'yoga', 'йога', 'breakfast', 'завтрак', 'tournament', 'турнир',
  'course', 'курс', 'курсы', 'exhibition', 'выставка', 'выставки', 'ярмарка', 'fair', 'market', 'рынок',
  'праздник', 'праздничный', 'фестиваль', 'festival', 'презентация', 'presentation', 'экскурсия',
  'excursion', 'прогулка', 'walk', 'evening', 'morning', 'вечер', 'вечера', 'party', 'пати', 'вечеринка',
  'игра', 'игры', 'quiz', 'live', 'show', 'шоу', 'тур', 'tour', 'presenting', 'presentation',
  // «песенный» тип: пара 878425b5/b2baea61 (Лимасол 25.10, Palio Xidadiko 11:00 ↔ Rialto 20:00)
  // совпала ровно на них — это РАЗНЫЕ концерты одного дня, а не одна афиша в двух вариантах
  'τραγούδια', 'τραγούδι', 'songs', 'song', 'песни', 'песня', 'песен']);

const contentWords = (r) => new Set([r.title, r.title_ru, r.title_en]
  .map(norm).flatMap((s) => s.split(' '))
  .filter((w) => w.length > 3 && !stop.has(w)));

const tKey = (r) => `${String(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;
const buckets = new Map();
for (const r of live) {
  const k = tKey(r);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(r);
}

const pairs = [];
for (const [, group] of buckets) {
  if (group.length < 2 || group.length > 220) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i]; const b = group[j];
      if (!a.start_time || !b.start_time) continue;
      if (String(a.start_time).slice(0, 5) === String(b.start_time).slice(0, 5)) continue;
      const wa = contentWords(a); const wb = contentWords(b);
      const common = [...wa].filter((w) => wb.has(w));
      if (common.length < 2) continue;
      const d = Math.round(distanceM(a, b));
      if (d > 1500) continue;
      pairs.push({ a, b, common, d });
    }
  }
}

console.log(`живых (${STATUSES.join('/')}) с гео: ${live.length}`);
console.log(`пар «один день+город, >=2 общих содержательных слова, РАЗНОЕ время, <=1500 м»: ${pairs.length}`);
pairs.sort((x, y) => x.d - y.d);
for (const p of pairs.slice(0, LIMIT)) {
  console.log(`--- ${p.d} м | общие: ${p.common.join(',')}`);
  console.log(`    ${p.a.id.slice(0, 8)} [${p.a.status}] ${String(p.a.start_time).slice(0, 5)} "${p.a.title}" | ${p.a.address || '—'} | ${p.a.website || '—'}`);
  console.log(`    ${p.b.id.slice(0, 8)} [${p.b.status}] ${String(p.b.start_time).slice(0, 5)} "${p.b.title}" | ${p.b.address || '—'} | ${p.b.website || '—'}`);
}
