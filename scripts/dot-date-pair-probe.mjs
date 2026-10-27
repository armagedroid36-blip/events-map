// Зонд пар по дате: живые карточки одного дня и города, где точки совпадают (<=250 м)
// и есть содержательное пересечение названий. Цель — дубли, которые liveDupeMatch
// пропускает (ему нужны >=3 общих слова И одинаковый адрес).
// Запуск: node --env-file=.env scripts/dot-date-pair-probe.mjs
import { words, norm, cityKey, distanceM, hasCoords, ADDR_STOP, EXTRA_STOP } from './live-dupe-key.mjs';

const URL_BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const COLS = 'id,title,title_ru,title_en,city,address,lat,lng,start_date,end_date,start_time,website';

async function fetchAll(status) {
  const out = [];
  for (let off = 0; ; off += 60) {
    let page = null;
    for (let attempt = 0; attempt < 4 && !page; attempt++) {
      try {
        const r = await fetch(`${URL_BASE}/rest/v1/events?status=eq.${status}&select=${COLS}&order=id.asc&limit=60&offset=${off}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' },
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        page = await r.json();
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise((res) => setTimeout(res, 800));
      }
    }
    out.push(...page);
    if (page.length < 60) break;
  }
  const seen=new Set(); return out.filter((r)=>{ if(seen.has(r.id)) return false; seen.add(r.id); return true; });
}

const today = new Date().toISOString().slice(0, 10);
const live = (await fetchAll('active')).filter((r) => String(r.start_date || '') >= today);
console.log(`живых будущих: ${live.length}`);

const TYPE_STOP = new Set(['концерт', 'concerts', 'concert', 'спектакль', 'выставка', 'exhibition', 'лекция', 'лекции',
  'семинар', 'workshop', 'мастер', 'класс', 'класса', 'йога', 'yoga', 'турнир', 'курс', 'курсы', 'показ', 'показы',
  'вечер', 'вечеринка', 'party', 'вечеров', 'детей', 'детский', 'детское', 'детская', 'взрослых', 'live', 'music',
  'музыка', 'музыкальный', 'театр', 'theatre', 'theater', 'кино', 'cinema', 'ярмарка', 'market', 'занятие', 'занятия',
  'экскурсия', 'tour', 'трип', 'ужин', 'dinner', 'бранч', 'brunch', 'завтрак', 'медитация', 'сет', 'сетов']);
const GENERIC_PLACE = new Set(['municipal', 'community', 'square', 'centre', 'center', 'building', 'gallery', 'hall',
  'hotel', 'bar', 'club', 'cafe', 'restaurant', 'park', 'street', 'avenue', 'theatre', 'stadium', 'museum']);

function sig(r) {
  const city = cityKey(r);
  const addr = new Set(words(r.address).concat(norm(r.address).split(' ')));
  const set = new Set();
  for (const t of [r.title, r.title_ru, r.title_en]) {
    for (const w of words(t || '')) {
      if (w.length < 5) continue;
      if (TYPE_STOP.has(w) || ADDR_STOP.has(w) || EXTRA_STOP.has(w) || GENERIC_PLACE.has(w)) continue;
      if (city.split(' ').includes(w)) continue;
      if (addr.has(w)) continue;
      set.add(w);
    }
  }
  return set;
}

const groups = new Map();
for (const r of live) {
  const k = `${String(r.start_date).slice(0, 10)}|${cityKey(r)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const cands = [];
for (const [k, arr] of groups) {
  if (arr.length < 2) continue;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      let d = null;
      if (hasCoords(a) && hasCoords(b)) d = distanceM(a, b);
      if (d === null || d > 250) continue;
      const sa = sig(a), sb = sig(b);
      const common = [...sa].filter((w) => sb.has(w));
      const ta = String(a.start_time || ''), tb = String(b.start_time || '');
      const bothTime = ta && tb && ta !== '00:00:00' && tb !== '00:00:00';
      cands.push({ k, a, b, d: Math.round(d), common, sameTime: ta === tb, bothTime });
    }
  }
}

console.log(`кандидатов (одна дата+город, точки <=250 м): ${cands.length}`);
const strong = cands.filter((c) => c.common.length >= 2);
const weak = cands.filter((c) => c.common.length < 2);
// Время решает, дубль это или несколько сеансов одного дня (урок 502):
// 00:00 и null у Cyprus Now/Бали — «время не указано», такие пары считаются совпадающими.
const unknownTime = (t) => !t || t === '00:00:00' || t === '00:00';
const dupes = strong.filter((c) => c.sameTime || unknownTime(c.a.start_time) || unknownTime(c.b.start_time));
const shows = strong.filter((c) => !dupes.includes(c));
console.log(`--- сильные (>=2 общих содержательных слова): ${strong.length}`);
console.log(`    дубль-кандидаты (время совпадает или не указано): ${dupes.length}`);
console.log(`    показы одного дня (оба времени заданы и различаются): ${shows.length}`);
const dump = (arr) => {
  for (const c of arr) {
    console.log(`\n[${c.k}] d=${c.d}м общие=${c.common.join(',')} время ${c.a.start_time || '-'} / ${c.b.start_time || '-'}`);
    console.log(`  A ${c.a.id.slice(0, 8)} ${c.a.title} | ${c.a.address}`);
    console.log(`  B ${c.b.id.slice(0, 8)} ${c.b.title} | ${c.b.address}`);
  }
};
console.log('\n=== ДУБЛЬ-КАНДИДАТЫ (нужен арбитр) ===');
dump(dupes);
console.log('\n=== ПОКАЗЫ ОДНОГО ДНЯ ===');
dump(shows);
console.log(`\n--- слабые: ${weak.length} (не печатаю)`);
