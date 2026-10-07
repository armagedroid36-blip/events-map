// fetch через curl + локальный туннель (Node fetch не уважает HTTP_PROXY, а
// прямой доступ к *.supabase.co и mypins.site из RU-сети режется). Подменяет
// globalThis.fetch объектом, совместимым с Response по тому, что реально
// используют supabase-js и scripts/seo-prerender.mjs: status/ok, text(), json(),
// headers.get() (в т.ч. content-type — иначе проба картинок в пре-рендере
// считала бы ЖИВЫЕ изображения мёртвыми).
//
// ВАЖНО: вызовы АСИНХРОННЫЕ (execFile + Promise). Синхронный execFileSync
// блокировал цикл событий и сериализовал пробы фото в пре-рендере — сборка
// растягивалась на десятки минут вместо параллельных 8 запросов.
//
// Тело запроса уходит в stdin (--data-binary @-): Windows-argv перекодирует
// не-ASCII, и греческий/кириллица в JSON-теле превращались в «invalid unicode
// code point». Заголовки ответа читаются через -D -.
import { execFile } from 'node:child_process';

export const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:10809';
const MARK = '__CURLMETA__';

/** Разбор вывода `curl -D - -w "\n__CURLMETA__%{http_code}"`:
 *  блок(и) заголовков, пустая строка, тело, маркер со статусом. */
function parseCurlOutput(out) {
  const idx = out.lastIndexOf(MARK);
  const status = idx >= 0 ? Number(out.slice(idx + MARK.length).trim()) : 0;
  let rest = (idx >= 0 ? out.slice(0, idx) : out).replace(/\r?\n$/, '');
  let headText = '';
  // ПИТФОЛ: туннель-прокси добавляет свой блок «200 Connection established» —
  // пропускаем его и берём настоящий ответ.
  while (/^HTTP\//.test(rest)) {
    const sep = rest.search(/\r?\n\r?\n/);
    if (sep < 0) {
      headText = rest;
      rest = '';
      break;
    }
    const block = rest.slice(0, sep);
    const after = rest.slice(sep).replace(/^\r?\n\r?\n/, '');
    if (/^HTTP\/[\d.]+\s+200\s+Connection established/i.test(block)) {
      rest = after;
      continue;
    }
    headText = block;
    rest = after;
    break;
  }
  const headerMap = new Map();
  for (const line of headText.split(/\r?\n/)) {
    const c = line.indexOf(':');
    if (c > 0) headerMap.set(line.slice(0, c).trim().toLowerCase(), line.slice(c + 1).trim());
  }
  return { status, body: rest, headerMap };
}

export function curlFetch(url, init = {}) {
  const args = ['-s', '--max-time', '60', '-x', PROXY, '-X', init.method || 'GET', '-D', '-'];
  const src = init.headers || {};
  const headers = {};
  if (typeof src.forEach === 'function' && !Array.isArray(src)) src.forEach((v, k) => { headers[k] = v; });
  else Object.assign(headers, src);
  // Тело — через stdin: Windows-argv перекодирует не-ASCII и JSON с греческим
  // или кириллицей ломается («invalid unicode code point»).
  if (init.body) args.push('--data-binary', '@-');
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push('-w', `\n${MARK}%{http_code}`);
  args.push(String(url));

  return new Promise((resolve, reject) => {
    let child;
    const done = (err, stdout) => {
      if (init.signal) init.signal.removeEventListener?.('abort', onAbort);
      if (err && !stdout) return reject(new Error(`curl: ${String(err.message).slice(0, 120)}`));
      const { status, body, headerMap } = parseCurlOutput(String(stdout || ''));
      resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: '',
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body)),
        headers: {
          get: (name) => headerMap.get(String(name).toLowerCase()) ?? null,
          forEach: (cb) => headerMap.forEach((v, k) => cb(v, k)),
        },
      });
    };
    const onAbort = () => { try { child.kill(); } catch { /* уже мёртв */ } };
    child = execFile('curl', args, { maxBuffer: 64 * 1024 * 1024 }, done);
    if (init.signal) {
      if (init.signal.aborted) onAbort();
      else init.signal.addEventListener('abort', onAbort, { once: true });
    }
    if (init.body) child.stdin.end(Buffer.from(String(init.body), 'utf8'));
    else child.stdin.end();
  });
}

export function installCurlFetch() {
  globalThis.fetch = curlFetch;
}
