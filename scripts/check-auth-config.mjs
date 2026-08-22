// Проверка конфига auth Supabase через Management API. Вывод ASCII, секреты маскируем.
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envRaw = fs.readFileSync(path.join(cwd, '.env'), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
const PAT = process.env.SBP_TOKEN || '';
console.log('REF: ' + (ref || 'MISSING'));
if (!ref || !PAT) { console.log('NO REF/PAT'); process.exit(1); }

const headers = {
  Authorization: 'Bearer ' + PAT,
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
  Origin: 'https://supabase.com',
  Referer: 'https://supabase.com/',
};

try {
  const res = await fetch('https://api.supabase.com/v1/projects/' + ref + '/config/auth', { headers });
  const txt = await res.text();
  console.log('STATUS: ' + res.status);
  if (res.ok) {
    const j = JSON.parse(txt);
    const keys = Object.keys(j).sort();
    console.log('KEYS: ' + keys.join(', '));
    console.log('mailer_autoconfirm=' + j.mailer_autoconfirm);
    console.log('smtp_host=' + (j.smtp_host || 'EMPTY'));
    console.log('smtp_port=' + (j.smtp_port || 'EMPTY'));
    console.log('smtp_user=' + (j.smtp_user || 'EMPTY'));
    console.log('smtp_pass=' + (j.smtp_pass ? (j.smtp_pass.length > 3 ? 'SET(len=' + j.smtp_pass.length + ')' : 'SET(short)') : 'EMPTY'));
    console.log('smtp_sender_name=' + (j.smtp_sender_name || 'EMPTY'));
    console.log('smtp_admin_email=' + (j.smtp_admin_email || 'EMPTY'));
  } else {
    console.log('BODY: ' + txt.slice(0, 400));
  }
} catch (e) {
  console.log('REQ ERR: ' + e.message);
}
