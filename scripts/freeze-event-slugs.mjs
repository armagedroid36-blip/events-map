#!/usr/bin/env node
/**
 * Заморозка хвоста URL события (slug_ru / slug_en).
 *
 * Зачем: до этой задачи eventSlug() каждый раз считал хвост адреса из текущих
 * title_ru/title_en — правка названия меняла URL в sitemap, canonical и ссылках
 * SPA (в прогоне 92 так сменилось 642 адреса). Теперь адрес фиксируется один раз
 * при первой публикации и дальше от названия не зависит.
 *
 * Правила:
 *   - берём опубликованные события (active + archived): архивным заморозка нужна
 *     тоже, иначе следующая правка их названий снова сменит адреса;
 *   - заполняем ТОЛЬКО пустые slug_ru / slug_en, заполненное не перезаписываем
 *     никогда (UPDATE дополнительно проверяет `is null` — гонка не перезапишет);
 *   - slug_en заполняем только если у события есть EN-версия (title_en или
 *     англоязычный оригинал) — иначе EN-страницы нет и замораживать нечего;
 *     когда title_en появится, слаг заморозится в первом же прогоне;
 *   - значение считается той же функцией eventSlug(), что у пре-рендера и SPA,
 *     поэтому скачка адреса нет: до заморозки URL = расчёт, после = то же самое.
 *
 * Запуск:
 *   node --env-file=.env scripts/freeze-event-slugs.mjs        # применить
 *   DRY_RUN=1 node --env-file=.env scripts/freeze-event-slugs.mjs   # только отчёт
 *
 * Прод-БД: пагинация через limit/offset (Range для PostgREST-функций сервер
 * игнорирует, а для таблиц надёжнее явные параметры).
 */
import { createClient } from '@supabase/supabase-js';
import { eventHasEn, eventSlug } from '../src/lib/slug.ts';

const URL_BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PAGE = 1000; // серверный максимум PostgREST
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const STATUSES = ['active', 'archived'];

if (!URL_BASE || !KEY) {
  console.error('нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE (запуск с --env-file=.env)');
  process.exit(1);
}

const db = createClient(URL_BASE, KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isTransient = (msg) =>
  /terminated|fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|other side closed|ETIMEDOUT|UND_ERR|50[234]|429/i.test(
    String(msg || ''),
  );

/** Один запрос с ретраями для транзиентных сетевых ошибок. */
async function retry(label, fn, attempts = 5) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fn();
      if (!res?.error) return res;
      lastErr = res.error.message || String(res.error);
    } catch (e) {
      lastErr = String((e && e.message) || e);
    }
    if (!isTransient(lastErr) || i === attempts) break;
    console.log(`${label}: повтор ${i}/${attempts - 1} после «${lastErr}»`);
    await sleep(1200 * i);
  }
  throw new Error(`${label}: ${lastErr}`);
}

const isEmpty = (v) => v == null || String(v).trim() === '';

/** Колонки slug_* появляются миграцией 20261024_event_slug_freeze.sql: без неё
 *  PostgREST отвечает 42703/PGRST204 «column does not exist». Подсказываем
 *  причину, а не падаем с сырым текстом. */
function explainSchemaError(message) {
  if (/slug_ru|slug_en/.test(String(message)) && /does not exist|PGRST20[04]|42703/i.test(String(message))) {
    return `колонок slug_ru/slug_en нет в базе — сначала примените миграцию supabase/migrations/20261024_event_slug_freeze.sql (${message})`;
  }
  return message;
}

/** Все опубликованные события постранично (limit/offset, стабильный порядок id).
 *
 *  Читаем напрямую PostgREST-запросом с параметрами limit/offset, а не через
 *  supabase-js .range(): Range — заголовок, который PostgREST для части
 *  эндпоинтов игнорирует; явные параметры читаются однозначно. Заодно
 *  пагинация не зависит от версии клиента. */
const SELECT_COLS = 'id,title,title_ru,title_en,source_lang,slug_ru,slug_en,status';

async function loadPublished() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${URL_BASE.replace(/\/$/, '')}/rest/v1/events` +
      `?select=${SELECT_COLS}` +
      `&status=in.(${STATUSES.join(',')})` +
      `&order=id.asc&limit=${PAGE}&offset=${offset}`;
    let page = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          const body = (await res.text()).slice(0, 300);
          throw new Error(`HTTP ${res.status}: ${body}`);
        }
        page = await res.json();
        if (!Array.isArray(page)) throw new Error('ожидался массив строк');
        lastErr = null;
        break;
      } catch (e) {
        lastErr = String((e && e.message) || e);
        if (!isTransient(lastErr) || attempt === 5) break;
        console.log(`events offset ${offset}: повтор ${attempt}/4 после «${lastErr}»`);
        await sleep(1200 * attempt);
      }
    }
    if (lastErr) throw new Error(`events offset ${offset}: ${lastErr}`);
    rows.push(...page);
    console.log(`events: загружено ${rows.length} (страница ${page.length})`);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Пул промисов: не больше n одновременных UPDATE. */
async function pool(items, n, worker) {
  const results = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const started = Date.now();
  console.log(`заморозка слагов${DRY_RUN ? ' (DRY_RUN — без записи)' : ''}: ${STATUSES.join(' + ')}`);

  const rows = await loadPublished();
  const jobs = [];
  let alreadyRu = 0;
  let alreadyEn = 0;
  let noEn = 0;

  for (const ev of rows) {
    const needRu = isEmpty(ev.slug_ru);
    const needEn = isEmpty(ev.slug_en) && eventHasEn(ev);
    if (!needRu) alreadyRu++;
    if (!isEmpty(ev.slug_en)) alreadyEn++;
    else if (!eventHasEn(ev)) noEn++;
    if (!needRu && !needEn) continue;
    jobs.push({
      id: ev.id,
      ru: needRu ? eventSlug(ev, 'ru') : null,
      en: needEn ? eventSlug(ev, 'en') : null,
    });
  }

  console.log(
    `опубликованных: ${rows.length}; уже заморожено RU: ${alreadyRu}, EN: ${alreadyEn}, ` +
      `без EN-версии: ${noEn}; к заморозке: ${jobs.length}`,
  );

  if (DRY_RUN || jobs.length === 0) {
    if (jobs.length) {
      console.log('примеры (DRY_RUN):');
      for (const j of jobs.slice(0, 10)) console.log(`  ${j.id}  ru=${j.ru}  en=${j.en ?? '-'}`);
    }
    console.log(`итог: 0 записей (${((Date.now() - started) / 1000).toFixed(1)} c)`);
    return;
  }

  let written = 0;
  let skippedRace = 0;
  const failures = [];

  await pool(jobs, CONCURRENCY, async (job) => {
    for (const [field, value] of [
      ['slug_ru', job.ru],
      ['slug_en', job.en],
    ]) {
      if (value == null) continue;
      try {
        const res = await retry(`${job.id} ${field}`, () =>
          db.from('events').update({ [field]: value }).eq('id', job.id).is(field, null).select('id'),
        );
        const n = Array.isArray(res.data) ? res.data.length : 0;
        if (n === 1) written++;
        else skippedRace++; // кто-то уже заполнил — не перезаписываем
      } catch (e) {
        failures.push(`${job.id} ${field}: ${e.message}`);
      }
    }
  });

  console.log(
    `записано полей: ${written}, пропущено (уже заполнено): ${skippedRace}, ` +
      `ошибок: ${failures.length} (${((Date.now() - started) / 1000).toFixed(1)} c)`,
  );
  for (const f of failures.slice(0, 20)) console.error('  ' + f);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error('freeze-event-slugs: ' + explainSchemaError(e?.message || e));
  process.exit(1);
});
