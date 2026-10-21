// Читающий зонд: живые карточки Cyprus Now, у которых страница-источник больше
// НЕ существует по своему URL, а отдаёт редирект (301/308) на новую страницу.
// Класс «агрегатор перенёс событие и переименовал страницу»: ключ title|start_date
// расходится (дата сдвинулась), множество website тоже (URL другой) — в лог
// прилетает только смена статуса, а карточка остаётся с устаревшей датой, и
// сборщик создаёт ВТОРУЮ карточку по новому адресу.
// Запуск: node --env-file=.env scripts/dot-cn-redirect-probe.mjs [лимит]
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const LIMIT = Number(process.argv[2] || 0);
const PROXY = 'http://127.0.0.1:10809';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const rows = await selectAll(db, 'events', 'id,status,title,start_date,start_time,city,website');
const cards = rows
  .filter(r => r.status === 'active' && /cyprusnow\.app\/event\//.test(r.website || ''))
  .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
const sample = LIMIT ? cards.slice(0, LIMIT) : cards;
console.log(`Живых карточек CN: ${cards.length}; проверяю ${sample.length}\n`);

function head(url) {
  // Ссылки в базе хранятся с РАВЫМИ не-ASCII символами (греческие слаги).
  // curl шлёт такие байты как есть и сервер отдаёт 404 — кодируем перед запросом
  // (проверено 13.10.2026: тот же URL без кодирования → 404, с кодированием → 200).
  const safe = String(url).replace(/[^\x00-\x7F]/g, ch => encodeURIComponent(ch));
  try {
    let out;
    try {
      out = execFileSync('curl', ['-sI', '--max-time', '15', '-x', PROXY, safe], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch {
      // Транзиентный обрыв прокси/таймаут — один повтор перед выводом «прочих».
      // Без повтора одиночный сбой выглядит как «страница мертва» (21.10.2026: 54633d2f
      // дал ERR, при повторной проверке тот же URL → 200).
      out = execFileSync('curl', ['-sI', '--max-time', '20', '-x', PROXY, safe], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      });
    }
    // ВАЖНО: через прокси `curl -I` печатает сначала строку CONNECT
    // («HTTP/1.1 200 Connection established»), и первый матч врёт — берём ПОСЛЕДНЮЮ.
    const codes = [...out.matchAll(/^HTTP\/1\.1 (\d{3})/gm)].map(m => m[1]);
    const code = codes.length ? codes[codes.length - 1] : '?';
    const loc = (out.match(/^location: (.+)$/im) || [])[1] || '';
    return { code, loc: loc.trim() };
  } catch {
    return { code: 'ERR', loc: '' };
  }
}

let redirected = 0, ok = 0, err = 0;
for (const c of sample) {
  const { code, loc } = head(c.website);
  if (code === '200') { ok++; continue; }
  if (code === '301' || code === '308' || code === '302') {
    redirected++;
    console.log(`РЕДИРЕКТ ${code} ${c.id.slice(0, 8)} ${c.start_date} ${c.start_time || '--'} | ${(c.title || '').slice(0, 42)}`);
    console.log(`   было: ${c.website}`);
    console.log(`   стало: ${loc}`);
    continue;
  }
  err++;
  console.log(`НЕ 200 (${code}) ${c.id.slice(0, 8)} ${c.start_date} | ${(c.title || '').slice(0, 42)} | ${c.website}`);
}
console.log(`\nИтог: 200 — ${ok}, редиректов — ${redirected}, прочих — ${err}`);
