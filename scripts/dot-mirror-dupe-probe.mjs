// Зонд класса «живой дубль-зеркало, невидимый штатному дедупу».
//
// Лид запуска 169: у cyprus.bz одно событие живёт под ДВУМЯ разными id страниц
// (/event/267e и /ru/event/3718), канон host+id их не склеивает; штатный дедуп
// (liveDupeMatch/liveAbbrevMatch/liveLangPlaceMatch) ловит пару только когда
// пины сошлись. Пока один пин стоит на центровом фолбэке, дубль живёт на карте.
//
// Здесь считаем БЕЗ требования совпадения места: день + нормализованный город +
// >=3 общих значимых слова по любой паре псевдонимов title/title_ru/title_en.
// Для каждой найденной пары печатаем, поймал бы её штатный ключ (samePlace /
// liveDupeMatch / liveAbbrevMatch / liveLangPlaceMatch) и расстояние пинов.
//
// Запуск: node --env-file=.env scripts/dot-mirror-dupe-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import {
  aliases, cityKey, distanceM, hasCoords, isCityLevelAddr, liveAbbrevMatch,
  liveDupeMatch, liveLangPlaceMatch, norm, words,
} from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,created_at,photos', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});

const overlapWords = (a, b) => {
  let best = [];
  for (const x of aliases(a)) {
    const wx = new Set(words(x));
    for (const y of aliases(b)) {
      const shared = [...wx].filter((w) => new Set(words(y)).has(w));
      if (shared.length > best.length) best = shared;
    }
  }
  return best;
};

const groups = new Map();
for (const r of rows) {
  const k = `${String(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const pairs = [];
for (const [k, list] of groups) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const shared = overlapWords(a, b);
      if (shared.length < 3) continue;
      const caughtBy = liveDupeMatch(a, b) ? 'liveDupeMatch'
        : (liveAbbrevMatch(a, b) ? 'liveAbbrevMatch'
          : (liveLangPlaceMatch(a, b) ? 'liveLangPlaceMatch' : null));
      const dist = (hasCoords(a) && hasCoords(b)) ? Math.round(distanceM(a, b)) : null;
      pairs.push({ key: k, shared, caughtBy, dist, a, b });
    }
  }
}

// Насколько похожи сами названия: если ВСЕ значимые слова короткого псевдонима
// встречаются в длинном — это уже не «одна тема», а то же название (подозрение),
// а не просто общие слова площадки/типа события (законные пары Убуда/деревень).
const titleFold = (r) => {
  let best = [];
  for (const x of aliases(r)) {
    const w = words(x);
    if (w.length > best.length) best = w;
  }
  return best;
};
const sameTitle = (a, b) => {
  const wa = titleFold(a), wb = titleFold(b);
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const setLong = new Set(long);
  return short.every((w) => setLong.has(w));
};
const timeConflict = (a, b) => Boolean(a.start_time && b.start_time && a.start_time !== b.start_time);

const caught = pairs.filter((p) => p.caughtBy);
const blind = pairs.filter((p) => !p.caughtBy);
const suspect = blind.filter((p) => sameTitle(p.a, p.b));
const conflicting = blind.filter((p) => timeConflict(p.a, p.b));

const line = (p, tag) => [
  tag,
  p.a.id.slice(0, 8), p.a.status, `"${(p.a.title_ru || p.a.title || '').slice(0, 46)}"`,
  p.a.start_time || '', p.a.lat != null ? `${p.a.lat},${p.a.lng}` : 'нет гео',
  '|',
  p.b.id.slice(0, 8), p.b.status, `"${(p.b.title_ru || p.b.title || '').slice(0, 46)}"`,
  p.b.start_time || '', p.b.lat != null ? `${p.b.lat},${p.b.lng}` : 'нет гео',
  `| общих: ${p.shared.join(',')}`,
  `| пины: ${p.dist == null ? 'н/д' : p.dist + ' м'}`,
  `| адрес-заглушка: ${isCityLevelAddr(p.a) ? 'A' : '-'}${isCityLevelAddr(p.b) ? 'B' : '-'}`,
  `| сайты: ${(p.a.website || '-').slice(0, 60)} <> ${(p.b.website || '-').slice(0, 60)}`,
].join(' ');

console.log(`Живых (active+moderation): ${rows.length}`);
console.log(`Пар «день+город+3 значимых слова» (без требования места): ${pairs.length}`);
console.log(`  из них штатный дедуп ловит: ${caught.length}`);
console.log(`  СЛЕПЫХ для штатного дедупа (кандидаты в зеркала): ${blind.length}`);
console.log(`    из них с тем же НАЗВАНИЕМ (подозрение на зеркало): ${suspect.length}`);
console.log(`    из них с расхождением времени начала: ${conflicting.length}`);
console.log(`  ПРИЁМКА: зеркал-подозрений должно быть 0, иначе разбирать по страницам источников`);
console.log('');
console.log('--- СЛЕПЫЕ ПАРЫ ---');
for (const p of blind.sort((x, y) => (x.dist ?? 1e9) - (y.dist ?? 1e9))) {
  const flags = [];
  if (sameTitle(p.a, p.b)) flags.push('ОДНО НАЗВАНИЕ');
  if (timeConflict(p.a, p.b)) flags.push('ВРЕМЯ РАСХОДИТСЯ');
  console.log(line(p, 'СЛЕПАЯ') + (flags.length ? ` | ФЛАГ: ${flags.join(' + ')}` : ''));
}
console.log('');
console.log('--- пойманные (для контроля ключа) ---');
for (const p of caught) console.log(line(p, p.caughtBy));
