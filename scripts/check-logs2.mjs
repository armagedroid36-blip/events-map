// Детальные логи auth: последние события с полным metadata. Вывод ASCII.
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envRaw = fs.readFileSync(path.join(cwd, '.env'), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL || '';
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
const PAT = process.env.SBP_TOKEN || '';
if (!ref || !PAT) { console.log('MISSING'); process.exit(1); }

const headers = {
  Authorization: 'Bearer ' + PAT,
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
  Origin: 'https://supabase.com',
  Referer: 'https://supabase.com/',
};

const now = Date.now();
const start = new Date(now - 6 * 3600 * 1000).toISOString();
const end = new Date(now).toISOString();
try {
  const res = await fetch(
    'https://api.supabase.com/v1/projects/' + ref + '/analytics/endpoints/logs.all?iso_timestamp_start=' + start + '&iso_timestamp_end=' + end,
    { headers },
  );
  const j = await res.json();
  const rows = j.result ?? [];
  console.log('LOGS count=' + rows.length);
  for (const r of rows) {
    const meta = r.metadata ?? {};
    const parts = [];
    for (const k of ['level', 'msg', 'error', 'path', 'status_code']) {
      if (meta[k] !== undefined && meta[k] !== null) parts.push(k + '=' + String(meta[k]).slice(0, 200));
    }
    console.log('--- ' + (r.event_type || '') + ' | ' + (r.event_message || '') + ' | ' + parts.join(' | '));
  }
} catch (e) {
  console.log('LOGS ERR: ' + e.message);
}
