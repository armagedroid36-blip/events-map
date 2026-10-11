// Ремонт ссылки карточки: `website` без схемы («www.famagustatc.com») или с ведущими
// пробелами. На сайте такая строка попадает в href как есть → её открывает НАШ домен
// (https://mypins.site/www.famagustatc.com = 404). Схему добавляем через normWebsite,
// но только если нормализованный URL реально отвечает 200 (проверенные данные).
// Запуск: node --env-file=.env scripts/dot-website-scheme-fix.mjs           (DRY)
//         APPLY=1 node --env-file=.env scripts/dot-website-scheme-fix.mjs   (записать)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { normWebsite } from './site-url.mjs';

const APPLY = process.env.APPLY === '1';
const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function statusOf(url) {
  // ПИТФОЛ: execFile запускает НАТИВНЫЙ curl.exe, а не bash — путь /dev/null в Windows
  // не существует, и curl падает (HTTP 0 у всех). Пишем в файл во временной папке.
  const sink = path.join(os.tmpdir(), 'dot-website-scheme.tmp');
  for (const args of [['-s', '-o', sink, '-L', '--max-time', '15', '-w', '%{http_code}', '-A', UA, url],
    ['-s', '-o', sink, '-L', '--max-time', '15', '-x', PROXY, '-w', '%{http_code}', '-A', UA, url]]) {
    try {
      const { stdout } = await execFileAsync('curl', args);
      const code = Number(String(stdout).trim());
      if (code >= 200 && code < 400) return code;
      if (code) return code; // первый ответ содержательный — второго шанса не нужно, но прокси-ход иногда спасает
    } catch { /* пробуем прокси */ }
  }
  return 0;
}
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
const execFileAsync = promisify(execFile);

const rows = await selectAll(db, 'events', 'id,status,title,city,start_date,website,source_type');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
console.log('живых', live.length, '| режим', APPLY ? 'APPLY' : 'dry');

const bad = live.filter((r) => r.website && normWebsite(r.website) !== r.website);
console.log('ссылок без схемы / с пробелами:', bad.length);

let applied = 0;
for (const r of bad) {
  const fixed = normWebsite(r.website);
  const code = await statusOf(fixed);
  const ok = code > 0 && code < 400;
  const line = `${r.id.slice(0, 8)} [${r.status}] ${r.city} | «${String(r.website).slice(0, 40)}» -> «${fixed.slice(0, 50)}» | HTTP ${code} ${ok ? 'OK' : 'ОТКЛОНЕНО'}`;
  if (!ok) { console.log(line); continue; }
  if (APPLY) {
    const { data, error } = await db.from('events').update({ website: fixed }).eq('id', r.id).select('id,website');
    if (error || !data?.length) { console.log(line, '| ОШИБКА:', error?.message || 'не обновлено'); continue; }
    applied++;
    console.log(line, '| записано');
  } else console.log(line, '| DRY');
}
console.log(APPLY ? `записано ${applied}, ошибок ${bad.length - applied}` : `кандидатов ${bad.length}`);

// контроль: перечитать те же карточки
if (APPLY) {
  const ids = bad.map((r) => r.id);
  const { data: after } = await db.from('events').select('id,website,status').in('id', ids);
  const still = (after || []).filter((r) => normWebsite(r.website) !== r.website);
  console.log('контроль: без нормализации осталось', still.length, still.map((r) => r.id.slice(0, 8)).join(' '));
  for (const r of after || []) console.log('  ', r.id.slice(0, 8), r.status, '|', r.website);
}
