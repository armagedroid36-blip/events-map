// Читающий зонд: состояние страниц-источников ЖИВЫХ театральных карточек (source_type=theatre).
// Читает через прокси 10809 браузерным curl'ом, классифицирует страницу: ok / MAINTENANCE / нет ответа / HTTP N.
// Плюс для карточек без start_time ищет в их странице время ЧЧ:ММ/ЧhММ и печатает найденные.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,website,address,start_date,start_time,status,source_type,recurrence');
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status) && r.source_type === 'theatre');
console.log('живых театральных карточек:', live.length);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Питфол: рыхлый маркер («coming soon», голое «maintenance») ловит ЗАГОЛОВКИ НОВОСТЕЙ на больших
// страницах (danang365 — статья «Coming Soon: Son Tra Innovation Fest») и объявляет живой сайт мёртвым.
// Маркер обязан быть точной фразой страницы-заглушки или стоять в <title>.
const MAINT = /site under maintenance|site is down|will be back soon|site is temporarily unavailable|сайт на обслуживании|<title>[^<]*(maintenance|обслуживании)/i;

async function fetchUrl(url, tag) {
  const out = path.join(os.tmpdir(), 'srcdown-' + tag + '.html');
  let code = '000', body = '';
  try {
    const r = await run('curl', ['-s', '-L', '-x', 'http://127.0.0.1:10809', '--max-time', '20', '-A', UA, '-o', out, '-w', '%{http_code}', url], { timeout: 25000, windowsHide: true });
    code = String(r.stdout).trim();
  } catch (e) { code = 'ERR'; }
  if (existsSync(out)) {
    try { body = readFileSync(out, 'utf8'); } catch { body = ''; }
    try { unlinkSync(out); } catch {}
  }
  return { code, body, size: body.length };
}

const hosts = [...new Set(live.map((r) => { try { return new URL(r.website).host.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean))];
console.log('хостов источников:', hosts.length, '|', hosts.join(', '));
const hostState = {};
for (const h of hosts) {
  let f = await fetchUrl('https://' + h + '/', h.replace(/[^a-z0-9]/gi, '_'));
  let state = f.code !== '200' ? 'HTTP ' + f.code : (MAINT.test(f.body) ? 'MAINTENANCE' : 'ok');
  // страница-заглушка может отдаваться НЕСТАБИЛЬНО (dotheatre.vn: раз 3.6 КБ «Site under
  // maintenance», раз 258 КБ рабочая) — при подозрении на смерть делаем контрольный запрос
  // и верим только двойному подтверждению.
  if (state !== 'ok') {
    const f2 = await fetchUrl('https://' + h + '/', h.replace(/[^a-z0-9]/gi, '_') + '_2');
    const state2 = f2.code !== '200' ? 'HTTP ' + f2.code : (MAINT.test(f2.body) ? 'MAINTENANCE' : 'ok');
    if (state2 !== state) state = 'нестабильно (' + state + ' / ' + state2 + ')';
  }
  hostState[h] = state;
  console.log([h, state, f.size + 'b'].join(' | '));
}

console.log('== карточки:');
for (const r of live) {
  let h = '-'; try { h = new URL(r.website).host.replace(/^www\./, ''); } catch {}
  console.log([r.id.slice(0, 8), h, hostState[h] || '?', (r.start_time ? String(r.start_time).slice(0, 5) : 'НЕТ ВРЕМЕНИ'), r.start_date, r.city, (r.title || '').slice(0, 40)].join(' | '));
}

console.log('== страницы карточек без времени (ищем ЧЧ:ММ на самой странице):');
for (const r of live.filter((x) => !x.start_time)) {
  const f = await fetchUrl(r.website, 'card' + r.id.slice(0, 4));
  const times = [...new Set((f.body.match(/\b([01]?\d|2[0-3])[:h][0-5]\d\b/g) || []))].slice(0, 12);
  console.log([r.id.slice(0, 8), r.website, 'HTTP ' + f.code, f.size + 'b', 'времена:', times.join(',') || 'НЕТ'].join(' | '));
  if (MAINT.test(f.body)) console.log('   ^^ СТРАНИЦА НА ОБСЛУЖИВАНИИ (maintenance)');
}
