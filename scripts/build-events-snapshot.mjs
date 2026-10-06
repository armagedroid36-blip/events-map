/**
 * Статический снапшот публичного списка событий: public/data/events.json
 *
 * Зачем: SPA тянет список карточек из Supabase RPC (~150 КБ gzip) на каждой
 * загрузке страницы. Трафик в основном краулерский, и он выжигает бесплатные
 * 5 ГБ egress Supabase. Снапшот публикуется вместе с сайтом на GitHub Pages
 * (там лимит мягкий), а Supabase остаётся только для авторизации, форм и
 * точечной догрузки карточки (get_public_event).
 *
 * Скрипт запускается перед `vite build` (см. package.json) и НЕ ломает сборку,
 * если ключей нет: в этом случае сайт просто читает живой RPC, как раньше.
 *
 * Ключи берутся из окружения (так в GitHub Actions) либо из .env-файлов
 * локально: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, при их отсутствии —
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE. Service-ключ используется только здесь,
 * в браузерный бандл он не попадает (префикса VITE_ у него нет).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PAGE = 1000;
const OUT_DIR = path.resolve('public/data');
const OUT_FILE = path.join(OUT_DIR, 'events.json');

function fromDotEnv(name) {
  for (const file of ['.env.local', '.env.build', '.env']) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const m = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch {
      /* файла нет — идём дальше */
    }
  }
  return undefined;
}

const env = (name) => process.env[name] || fromDotEnv(name);

const url = env('VITE_SUPABASE_URL') || env('SUPABASE_URL');
const key =
  env('VITE_SUPABASE_ANON_KEY') ||
  env('SUPABASE_ANON_KEY') ||
  env('SUPABASE_SERVICE_ROLE');

if (!url || !key) {
  console.warn('[snapshot] нет ключей Supabase — снапшот не собираю (SPA прочитает живой RPC)');
  process.exit(0);
}

async function fetchPage(from) {
  // Пагинация — параметрами функции (миграция 20261006). Заголовок Range
  // PostgREST для неё игнорирует, поэтому запросы с Range отдавали одну и ту
  // же первую тысячу; query-параметры limit/offset тоже работают, но явные
  // аргументы читаются однозначнее.
  const res = await fetch(`${url}/rest/v1/rpc/list_active_event_cards`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'count=none',
    },
    body: JSON.stringify({ p_limit: PAGE, p_offset: from }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('ожидался массив строк');
  return rows;
}

async function main() {
  const cards = [];
  const seen = new Set();
  let pages = 0;
  for (let from = 0; ; from += PAGE) {
    const rows = await fetchPage(from);
    let fresh = 0;
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue;
      seen.add(row.id);
      cards.push(row);
      fresh += 1;
    }
    pages += 1;
    // Защита от бесконечного цикла: если страница не принесла новых строк
    // (пагинация не применилась) — останавливаемся, а не крутимся до таймаута.
    if (rows.length < PAGE || fresh === 0 || pages > 50) break;
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source: 'list_active_event_cards',
    count: cards.length,
    cards,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  const bytes = fs.statSync(OUT_FILE).size;
  console.log(
    `[snapshot] ${cards.length} карточек, ${(bytes / 1024).toFixed(0)} КБ → ${path.relative(process.cwd(), OUT_FILE)}`,
  );
}

main().catch((err) => {
  // Сборку не валим: SPA умеет читать живой RPC, а прошлый снапшот (если есть)
  // остаётся на месте — публикуем как было лучше, чем не публиковать вовсе.
  const had = fs.existsSync(OUT_FILE);
  console.warn(`[snapshot] ошибка: ${err.message}. ${had ? 'Оставляю прошлый снапшот.' : 'Снапшота нет — сайт пойдёт в живой RPC.'}`);
  process.exit(0);
});
