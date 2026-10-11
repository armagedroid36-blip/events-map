// Зонд класса-гэпа зонда зеркал: «2 общих значимых слова + ПЕРЕСЕЧЕНИЕ интервалов».
//
// Лид запуска 173: тройка живых карточек одного турнира ITF Masters 400 (Лимасол,
// Famagusta Tennis Club, 2-8.11) висела на карте, а `dot-mirror-dupe-probe` её
// не видел: правило требует ТРИ общих значимых слова, а у пары их было два
// («itf», «masters») — при этом интервал одной карточки пересекал/содержал окно другой.
//
// Здесь ищем ЖИВЫЕ (active+moderation) пары:
//   * тот же нормализованный город;
//   * пересечение значимых слов по псевдонимам title/title_ru/title_en РОВНО 2
//     (3+ закрывает зонд зеркал, 0-1 = просто один город);
//   * окна дат ПЕРЕСЕКАЮТСЯ, и хотя бы одно окно длиннее суток (интервал),
//     ЛИБО одна карточка лежит ВНУТРИ окна другой;
//   * разные страницы-источники (website), иначе это копия одного URL.
// Печатаем: поймал бы пару штатный ключ, расстояние пинов, окна, адреса, ссылки.
//
// Запуск: node --env-file=.env scripts/dot-thin-word-window-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import {
  aliases, cityKey, distanceM, GENERIC, hasCoords, isCityLevelAddr, liveAbbrevMatch,
  liveDupeMatch, liveLangPlaceMatch, norm, PLACE_STOP, words,
} from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,end_date,start_time,end_time,status,website,source_type,lat,lng,created_at,photos', {
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

const d = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00Z`).getTime() : null);
const window = (r) => {
  const s = d(r.start_date); if (s == null) return null;
  const e = d(r.end_date) ?? s;
  return { s, e: Math.max(s, e) };
};
const overlaps = (x, y) => x && y && x.s <= y.e && y.s <= x.e;
const contains = (outer, inner) => outer && inner && outer.s <= inner.s && outer.e >= inner.e;
const longerThanDay = (w) => w && (w.e - w.s) > 86400000;

const groups = new Map();
for (const r of rows) {
  const k = cityKey(r);
  if (!k) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const host = (u) => { try { return new URL(String(u)).host.replace(/^www\./, ''); } catch { return null; } };
const siteKey = (u) => { try { const x = new URL(String(u)); return `${x.host.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}`; } catch { return null; } };

const pairs = [];
for (const [city, list] of groups) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const shared = overlapWords(a, b);
      if (shared.length !== 2) continue;
      // Слова площадки/типа события/города в адресе не доказывают одного события:
      // у пары «Кинопоказ Brave в Paradiso Ubud» ↔ «Кинопоказ Wild в Paradiso Ubud»
      // общих слов ровно два (paradiso, ubud) — это разные фильмы одного кинотеатра.
      const addrA = new Set(norm(a.address).split(' ').filter(Boolean));
      const addrB = new Set(norm(b.address).split(' ').filter(Boolean));
      const core = shared.filter((w) => !addrA.has(w) && !addrB.has(w) && !GENERIC.has(w) && !PLACE_STOP.has(w));
      if (!core.length) continue;
      const wa = window(a), wb = window(b);
      if (!overlaps(wa, wb)) continue;
      if (!longerThanDay(wa) && !longerThanDay(wb) && !contains(wa, wb) && !contains(wb, wa)) continue;
      const sa = siteKey(a.website), sb = siteKey(b.website);
      if (sa && sb && sa === sb) continue;
      const caughtBy = liveDupeMatch(a, b) ? 'liveDupeMatch'
        : (liveAbbrevMatch(a, b) ? 'liveAbbrevMatch'
          : (liveLangPlaceMatch(a, b) ? 'liveLangPlaceMatch' : null));
      pairs.push({ city, shared, core, caughtBy, wa, wb, a, b, dist: (hasCoords(a) && hasCoords(b)) ? Math.round(distanceM(a, b)) : null, sa, sb });
    }
  }
}

const fmtWindow = (r) => `${String(r.start_date).slice(0, 10)}${r.end_date && r.end_date !== r.start_date ? '→' + String(r.end_date).slice(0, 10) : ''}`;
const line = (p) => [
  p.a.id.slice(0, 8), p.a.status, `"${(p.a.title_ru || p.a.title || '').slice(0, 44)}"`,
  fmtWindow(p.a), p.a.start_time || '--:--', p.a.lat != null ? `${p.a.lat},${p.a.lng}` : 'нет гео',
  '|', p.b.id.slice(0, 8), p.b.status, `"${(p.b.title_ru || p.b.title || '').slice(0, 44)}"`,
  fmtWindow(p.b), p.b.start_time || '--:--', p.b.lat != null ? `${p.b.lat},${p.b.lng}` : 'нет гео',
  `| общих: ${p.shared.join(',')}`,
  `| ЯДРО: ${p.core.join(',')}`,
  `| пины: ${p.dist == null ? 'н/д' : p.dist + ' м'}`,
  `| вложено: ${contains(p.wa, p.wb) ? 'B в A' : contains(p.wb, p.wa) ? 'A в B' : 'частично'}`,
  `| адрес-заглушка: ${isCityLevelAddr(p.a) ? 'A' : '-'}${isCityLevelAddr(p.b) ? 'B' : '-'}`,
  `| сайты: ${(p.a.website || '-').slice(0, 52)} <> ${(p.b.website || '-').slice(0, 52)}`,
].join(' ');

console.log(`Живых (active+moderation): ${rows.length}`);
console.log(`Пар «город + ровно 2 общих слова + пересечение окон»: ${pairs.length}`);
console.log(`  из них штатный дедуп ловит: ${pairs.filter((p) => p.caughtBy).length}`);
console.log(`  СЛЕПЫХ: ${pairs.filter((p) => !p.caughtBy).length}`);
console.log('ПРИЁМКА: слепые пары разбирать по страницам источников (какая карточка совпадает с источником).');
console.log('');
for (const p of pairs.sort((x, y) => (x.dist ?? 1e9) - (y.dist ?? 1e9))) {
  console.log((p.caughtBy ? `[${p.caughtBy}]` : '[СЛЕПАЯ]') + ' ' + line(p));
}
