// Ремонт класса 350: АРХИВНЫЕ карточки Балифорума, у которых запись источника ВСЁ ЕЩЁ даёт
// будущие даты (событие продолжается: клуб, курс, выставка). Карточка получила start_date
// первой даты и была заархивирована archive-past.mjs, хотя у источника есть будущие даты.
//
// Что делает: по ТОЧНОМУ website сверяет карточку с записью ленты, ставит ближайшую будущую
// дату источника, end_date (короткий ряд дней или конец окна) и recurrence (bali-recurrence.mjs),
// возвращает карточку в очередь модерации (status='moderation') — публикует её автопроверка.
// DRY по умолчанию, APPLY=1 пишет. Норма после прогона: архивных с будущими датами 0.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { selectAll } from './db-rows.mjs';
import { recurrenceOf } from './bali-recurrence.mjs';

const APPLY = process.env.APPLY === '1';
const API = 'https://baliforum.ru/api/v1/events';
const PAGES = Number(process.env.PAGES || 8);
const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';
const DAY = 86400000;

function curlJson(target) {
  const out = execFileSync('curl', ['-s', '--max-time', '20', '-x', PROXY, target], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(String(out));
}

const feed = new Map();
for (let p = 1; p <= PAGES; p++) {
  let j = null;
  try { j = curlJson(`${API}?defaultList=1&page=${p}`); } catch (e) { console.log('страница', p, 'ошибка:', e.message); break; }
  const data = j?.data || [];
  if (!data.length) break;
  for (const e of data) if (!feed.has(e.slug)) feed.set(e.slug, e);
}
console.log('слагов в ленте:', feed.size);

const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,status,website,title,start_date,end_date,recurrence,city', {});
const byWeb = new Map();
for (const r of rows) if (r.website) byWeb.set(String(r.website).replace(/\/$/, ''), r);
const liveDates = new Set();      // title|start_date живых карточек — страховка от дубля
const liveWeb = new Set();        // website живых карточек
for (const r of rows) {
  if (r.status === 'active' || r.status === 'moderation' || r.status === 'needs_changes') {
    liveDates.add(`${String(r.title || '').trim().toLowerCase()}|${r.start_date}`);
    if (r.website) liveWeb.add(String(r.website).replace(/\/$/, ''));
  }
}

const plan = [];
const skipped = [];
for (const e of feed.values()) {
  const web = `https://baliforum.ru/events/${e.slug}`;
  const r = byWeb.get(web);
  if (!r || r.status !== 'archived') continue;
  const fut = (e.eventDates || [])
    .map((d) => ({ s: String(d.startAt || '').slice(0, 10), end: d.endAt ? String(d.endAt).slice(0, 10) : null }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.s) && d.s >= today)
    .sort((a, b) => a.s.localeCompare(b.s));
  if (!fut.length) continue;
  const nearest = fut[0];
  if (liveWeb.has(web)) { skipped.push(`${r.id} живой близнец по website`); continue; }
  if (liveDates.has(`${String(r.title || '').trim().toLowerCase()}|${nearest.s}`)) {
    skipped.push(`${r.id} живой близнец по title|date`);
    continue;
  }
  const dates = fut.map((d) => d.s);
  const recurrence = recurrenceOf(dates);
  // end_date: конец записи, а без него — короткий ряд подряд идущих дней (≤3), иначе null
  let endDate = nearest.end && nearest.end > nearest.s ? nearest.end : null;
  if (!endDate) {
    let last = nearest.s;
    for (let i = 1; i < fut.length && i < 3; i++) {
      const gap = Math.round((Date.parse(fut[i].s) - Date.parse(last)) / DAY);
      if (gap !== 1) break;
      last = fut[i].s;
    }
    if (last !== nearest.s) endDate = last;
  }
  plan.push({ id: r.id, title: String(r.title || '').slice(0, 42), from: r.start_date, to: nearest.s, endDate, recurrence, n: fut.length, web });
}

console.log(`к ремонту: ${plan.length}, пропущено: ${skipped.length}`);
for (const s of skipped) console.log('  пропуск:', s);
for (const p of plan) {
  console.log(`  ${p.id} ${p.from} -> ${p.to}${p.endDate ? '..' + p.endDate : ''} | n=${p.n} | rec=${JSON.stringify(p.recurrence)} | ${p.title}`);
}

if (!APPLY) {
  console.log('DRY: ничего не записано. APPLY=1 — применить.');
  process.exit(0);
}

let done = 0;
for (const p of plan) {
  const { data, error } = await db
    .from('events')
    .update({ start_date: p.to, end_date: p.endDate, recurrence: p.recurrence, status: 'moderation' })
    .eq('id', p.id)
    .eq('status', 'archived')
    .select('id,status,start_date,end_date,recurrence');
  if (error) { console.error('  ошибка', p.id, error.message); continue; }
  if (!data?.length) { console.error('  не обновлено (статус изменился?)', p.id); continue; }
  done++;
}
console.log(`применено: ${done} из ${plan.length}`);
// Контроль: архивная карточка Балифорума с будущими датами — потеря ТОЛЬКО если у страницы нет
// живой копии (у 26 из 28 архивных копий живая карточка того же URL уже есть — это не потери).
const left = await selectAll(db, 'events', 'id,status,website,start_date', { filter: (q) => q.eq('status', 'archived') });
let still = 0;
const leftWeb = new Map(left.map((x) => [String(x.website || '').replace(/\/$/, ''), x]));
for (const e of feed.values()) {
  const web = `https://baliforum.ru/events/${e.slug}`;
  if (!leftWeb.has(web)) continue;
  const fut = (e.eventDates || []).map((d) => String(d.startAt || '').slice(0, 10)).filter((d) => d >= today);
  if (fut.length && !liveWeb.has(web)) { still++; console.log('  ПОТЕРЯ:', web, fut.slice(0, 2).join(',')); }
}
console.log(`контроль: архивных Балифорума с будущими датами БЕЗ живой копии — ${still} (норма 0)`);
