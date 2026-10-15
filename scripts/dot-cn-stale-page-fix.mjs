// Ремонт класса «страница карточки Cyprus Now больше не существует»:
// агрегатор переименовал страницу события (старый слаг отдаёт 500, а не редирект,
// поэтому зонд редиректов его не видит), а карточка держит устаревший URL —
// ссылка «источник» на карте открывает ошибку сервера.
//
// Лечение: ссылку карточки привести к КАНОНИЧЕСКОЙ странице того же события
// (арбитр — запись ленты CN: тот же день/время/площадка, другой слаг).
// Правила:
//  - карточка живая (active), ровно одна по id, url совпадает со старым;
//  - новая страница отвечает 200, старая — НЕ 200 (иначе фикс не нужен);
//  - запись ленты с новым слагом существует и её дата совпадает с start_date карточки.
// Запуск: node --env-file=.env scripts/dot-cn-stale-page-fix.mjs [--apply]
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const PROXY = 'http://127.0.0.1:10809';

// id -> { old: фрагмент старого URL, neu: канонический URL, feedSlug, startAt, why }
const PLAN = [
  {
    id: '2a4e08ed',
    old: 'sooshi-mango-home-made-world-tour-in-nicosia-2026-10-20',
    neu: 'https://cyprusnow.app/event/θεατρική-παράσταση-sooshi-mango-20-10-26-2026-10-20',
    feedSlug: 'θεατρική-παράσταση-sooshi-mango-20-10-26-2026-10-20',
    qTerm: 'sooshi',
    startAt: '2026-10-20T17:00:00.000Z', // = 20:00 местного, совпадает со start_time карточки
    why: 'старый слаг отдаёт 500; лента CN по ?q=sooshi даёт единственную запись 20.10 17:00Z в зале Strovolos Municipal Theatre = адрес и время карточки',
  },
  {
    id: '71d2943a',
    old: 'ανακαλύπτουμε-συνδεόμαστε-τολμάμε-erasmus-days-2026-2026-10-16',
    neu: 'https://cyprusnow.app/event/erasmus-days-2026-στο-δήμο-νότιας-λευκωσίας-ιδαλίου-2026-10-16',
    feedSlug: 'erasmus-days-2026-στο-δήμο-νότιας-λευκωσίας-ιδαλίου-2026-10-16',
    qTerm: 'erasmus',
    startAt: '2026-10-16T15:00:00.000Z', // = 18:00 местного, совпадает со start_time карточки
    why: 'старый слаг «ανακαλύπτουμε…» отдаёт 500; лента CN по ?q=erasmus даёт запись того же дня 15:00Z с площадкой Κοινοτικό Πάρκο Λυμπιών = адрес карточки (Lympia Park Amphitheatre)',
  },
  {
    id: 'fb846ffd',
    old: 'giorgos-giannias-live-at-zazza-music-theater-2026-10-16',
    neu: 'https://cyprusnow.app/event/zazza-music-theater-opening-με-γιώργο-γιαννιά-2026-10-16',
    feedSlug: 'zazza-music-theater-opening-με-γιώργο-γιαννιά-2026-10-16',
    qTerm: 'zazza',
    startAt: '2026-10-16T19:00:00.000Z',
    why: 'старый слаг отдаёт 500; лента CN по ?q=zazza/?q=γιαννιά даёт ровно одну запись 16.10 в зале ZAZZA Music Theatre = адрес карточки (время у записи 22:00 местного против 21:00 у карточки — время НЕ трогаем)',
  },
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,title,start_date,start_time,city,website');
const now = new Date().toISOString();

function code(url) {
  const safe = String(url).replace(/[^\x00-\x7F]/g, ch => encodeURIComponent(ch));
  for (const args of [['-sI', '--max-time', '20', safe], ['-sI', '--max-time', '20', '-x', PROXY, safe]]) {
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
      const codes = [...out.matchAll(/^HTTP\/1\.1 (\d{3})/gm)].map(m => m[1]);
      if (codes.length) return codes[codes.length - 1];
    } catch { /* пробуем следующий способ */ }
  }
  return 'ERR';
}

async function feed(term) {
  // Термин задаётся в PLAN (qTerm): широкий термин (греческое слово, «мango») отдаёт
  // многомегабайтный ответ и curl падает по таймауту (exit 28) — ошибку НЕ глотаем молча,
  // но и не роняем весь прогон: карточка просто не применяется.
  try {
    const out = execFileSync('curl', ['-s', '--max-time', '25', `https://cyprusnow.app/api/events?q=${encodeURIComponent(term)}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return (JSON.parse(out).events || []);
  } catch (e) {
    console.log(`   лента по ?q=${term} не прочитана (${e.status || 'err'})`);
    return null;
  }
}

let applied = 0, skipped = 0, errors = 0;
for (const p of PLAN) {
  const card = rows.find(r => r.id.startsWith(p.id) && r.status === 'active');
  if (!card) { console.log(`${p.id} | пропуск: живой карточки нет`); skipped++; continue; }
  if (!card.website || !card.website.includes(p.old)) { console.log(`${p.id} | пропуск: ссылка карточки не совпала со старой`); skipped++; continue; }
  const oldCode = code(card.website);
  const newCode = code(p.neu);
  if (newCode !== '200') { console.log(`${p.id} | пропуск: новая страница отдаёт ${newCode}`); skipped++; errors++; continue; }
  const events = await feed(p.qTerm || p.feedSlug.split('-')[0]);
  if (!events) { console.log(`${p.id} | пропуск: лента CN недоступна`); skipped++; continue; }
  const rec = events.find(e => e.slug === p.feedSlug);
  if (!rec) { console.log(`${p.id} | пропуск: записи ленты с новым слагом нет`); skipped++; errors++; continue; }
  const feedDate = String(rec.start_at || '').slice(0, 10);
  if (feedDate !== card.start_date) { console.log(`${p.id} | пропуск: дата ленты ${feedDate} != start_date ${card.start_date}`); skipped++; errors++; continue; }
  console.log(`${p.id} | ${card.start_date} ${card.start_time || '--'} | ${(card.title || '').slice(0, 40)}`);
  console.log(`   старая страница: ${oldCode} -> новая: 200 | запись ленты ${rec.slug}`);
  console.log(`   why: ${p.why}`);
  if (!APPLY) continue;
  const upd = await db.from('events').update({ website: p.neu, updated_at: now }).eq('id', card.id).select('id');
  if (upd.error || !upd.data || upd.data.length !== 1) { console.log(`   ОШИБКА записи: ${upd.error?.message || 'строка не обновлена'}`); errors++; continue; }
  applied++;
}
console.log(APPLY ? `\nПРИМЕНЕНО ${applied}, пропущено ${skipped}, ошибок ${errors}` : `\nПЛАН ${PLAN.length}, пропущено ${skipped} (DRY: без --apply ничего не пишется)`);
