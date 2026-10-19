// Добор ОПИСАНИЯ живых карточек без текста — со страницы источника (website карточки).
// Берём только проверенный текст страницы: og:description / meta description / JSON-LD description /
// первый содержательный абзац. Текст на латинице кладём в description_en, кириллицу — в description.
// Страховки: длина 60..700, отсечение служебных фраз, совпадение хотя бы одного значимого слова с названием
// (иначе это общий блур сайта, а не описание события).
// Запуск: node --env-file=.env scripts/dot-desc-backfill.mjs              (сухой прогон)
//         APPLY=1 LIMIT=20 node --env-file=.env scripts/dot-desc-backfill.mjs (записать)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';
const execP = promisify(execFile);
const APPLY = process.env.APPLY === '1';
const LIMIT = Number(process.env.LIMIT || 40);
const BUDGET_MS = Number(process.env.BUDGET_MS || 100000);
const t0 = Date.now();

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const rows = await selectAll(db, 'events', 'id,status,title,title_en,city,start_date,website,description,description_en,source_type');
const empty = (v) => !String(v || '').replace(/<[^>]+>/g, '').trim();
const targets = rows.filter(
  (r) => r.status === 'active' && /^https?:/.test(r.website || '') && empty(r.description) && empty(r.description_en),
);
console.log('строк:', rows.length, '| живых без описания:', targets.length, '| режим:', APPLY ? 'APPLY' : 'dry', '| лимит:', LIMIT);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const ACCEPT = 'text/html,application/xhtml+xml';

async function fetchHtml(url, useProxy) {
  const args = ['-sL', '--max-time', '12', '-A', UA, '-H', `Accept: ${ACCEPT}`];
  if (useProxy) args.push('-x', PROXY);
  args.push(url);
  const { stdout } = await execP('curl', args, { maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' });
  return stdout || '';
}

const JUNK = /(cookie|javascript|включите|подпиш(и|к)|read more|leituras|subscribe|sign up|newsletter|privacy|©)/i;
// SEO-шаблон агрегаторов («Rock opera 1984 is a Music event at Pattihio Municipal Theatre, Limassol on …») —
// это не описание события, а пересказ метаданных; на карточку не кладём.
// Строка «Локация, Локация, Mon, 16 Nov 2026. Текст» — та же агрегаторная склейка адреса и даты
// (встречается с опечаткой «Cypus»), тоже не описание.
// Навигационный мусор сайтов-афиш («Planning a trip? What's on in Limassol in October · Paphos …»).
const NAV = /planning a trip|what's on in|whats on in|·\s*\w+ in (October|November|December)|·/i;
const TEMPLATE2 = /^[^.]{0,60},\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+\w+\s+\d{4}\./i;
const TEMPLATE = /\bis an?\s+(\S+\s+){0,3}event at\b|\bis a\s+(Music|Dance|Arts|Sports|Theatre|Comedy|Festival)\b[^.]{0,80}\bon\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i;
const clean = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&laquo;|&raquo;/gi, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();

function decodeEntities(s) {
  return clean(s);
}

const words = (t) =>
  String(t || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w));

const STOP = new Set(['все', 'этот', 'этого', 'событие', 'события', 'мероприятие', 'билеты', 'концерт', 'выставка', 'фестиваль',
  'event', 'events', 'concert', 'tickets', 'festival', 'show', 'live', 'with', 'from', 'that', 'this', 'your', 'will']);

function relevant(text, title) {
  const tw = words(title).filter((w) => !STOP.has(w));
  if (!tw.length) return true;
  const set = new Set(words(text));
  return tw.some((w) => set.has(w) || (w.length > 5 && [...set].some((x) => x.startsWith(w.slice(0, 5)))));
}

function extract(html) {
  const out = [];
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']{20,900})["']/i);
    if (c) out.push(decodeEntities(c[1]));
  }
  for (const m of html.matchAll(/<meta[^>]+name=["']description["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']{20,900})["']/i);
    if (c) out.push(decodeEntities(c[1]));
  }
  // JSON-LD description (только строковые, любые вложения)
  for (const m of html.matchAll(/"description"\s*:\s*"((?:[^"\\]|\\.){30,1200})"/g)) {
    out.push(decodeEntities(m[1].replace(/\\n|\\r|\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\//g, '/')));
  }
  // первый содержательный абзац
  for (const m of html.matchAll(/<p[^>]*>([\s\S]{60,1200}?)<\/p>/gi)) {
    out.push(decodeEntities(m[1]));
    if (out.length > 40) break;
  }
  return out;
}

function pick(cands, title) {
  for (const raw of cands) {
    const t = clean(raw);
    if (t.length < 60 || t.length > 700) continue;
    if (JUNK.test(t)) continue;
    if (TEMPLATE.test(t) || TEMPLATE2.test(t) || NAV.test(t)) continue;
    if (/^(https?:|\/)/.test(t)) continue;
    if (!relevant(t, title)) continue;
    return t;
  }
  return '';
}

const isLatin = (t) => (t.match(/[A-Za-z]/g) || []).length > (t.match(/[А-Яа-яЁё]/g) || []).length * 3;

let found = 0;
let written = 0;
const report = [];

const queue = targets.slice(0, LIMIT);
const CONC = Number(process.env.CONC || 6);
let qi = 0;

async function fetchOne(r) {
  let html = '';
  try {
    html = await fetchHtml(r.website, false);
    if (!html || html.length < 400) html = await fetchHtml(r.website, true);
  } catch {
    try {
      html = await fetchHtml(r.website, true);
    } catch {
      html = '';
    }
  }
  return html;
}

// Параллельная загрузка: страницы источников отвечают по 5-12 с, последовательно 46 карточек не уложить в бюджет.
const htmls = new Array(queue.length).fill('');
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (qi < queue.length && Date.now() - t0 < BUDGET_MS) {
      const i = qi++;
      htmls[i] = await fetchOne(queue[i]);
    }
  }),
);

for (let i = 0; i < queue.length; i++) {
  const r = queue[i];
  const html = htmls[i];
  if (!html) {
    report.push(`нет страницы: ${r.id} ${r.website}`);
    continue;
  }
  const text = pick(extract(html), r.title);
  if (!text) {
    report.push(`нет описания на странице: ${r.id} ${r.city} | ${r.title}`);
    continue;
  }
  found++;
  const field = isLatin(text) ? 'description_en' : 'description';
  if (APPLY) {
    const { data, error } = await db.from('events').update({ [field]: text }).eq('id', r.id).select('id');
    if (error) report.push(`ОШИБКА ${r.id}: ${error.message}`);
    else if ((data || []).length) {
      written++;
      report.push(`+ ${r.id} [${field}] ${r.city} | ${text.slice(0, 90)}...`);
    }
  } else {
    report.push(`~ ${r.id} [${field}] ${r.city} | ${text.slice(0, 90)}...`);
  }
}

console.log(report.join('\n'));
console.log(`\nИТОГО: кандидатов ${targets.length}, обработано ${Math.min(targets.length, LIMIT)}, найдено описаний ${found}, записано ${written}`);
