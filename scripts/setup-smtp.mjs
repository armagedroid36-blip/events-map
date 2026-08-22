// Настройка SMTP в Supabase (PATCH config/auth) + тест signUp. Вывод ASCII.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const envRaw = fs.readFileSync(path.join(cwd, '.env'), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
const anon = env.VITE_SUPABASE_ANON_KEY || '';
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
const PAT = process.env.SBP_TOKEN || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
if (!ref || !PAT || !SMTP_PASS) { console.log('MISSING ref/pat/pass'); process.exit(1); }

const body = {
  smtp_host: 'smtp.mail.ru',
  smtp_port: '587',
  smtp_user: 'onthemap@inbox.ru',
  smtp_pass: SMTP_PASS,
  smtp_sender_name: 'События на карте',
  smtp_admin_email: 'onthemap@inbox.ru',
};

const headers = {
  Authorization: 'Bearer ' + PAT,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
  Origin: 'https://supabase.com',
  Referer: 'https://supabase.com/',
};

try {
  const res = await fetch('https://api.supabase.com/v1/projects/' + ref + '/config/auth', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  console.log('PATCH status=' + res.status);
  if (!res.ok) { console.log('PATCH BODY: ' + txt.slice(0, 500)); process.exit(1); }
  const j = JSON.parse(txt);
  console.log('smtp_host=' + j.smtp_host);
  console.log('smtp_port=' + j.smtp_port);
  console.log('smtp_user=' + j.smtp_user);
  console.log('smtp_admin=' + j.smtp_admin_email);
  console.log('smtp_pass=' + (j.smtp_pass ? 'set' : 'empty'));
} catch (e) {
  console.log('PATCH ERR: ' + e.message);
}

// Тест signUp: должно создаться письмо с кодом
try {
  const db = createClient(url, anon, { auth: { persistSession: false } });
  const ts = Date.now();
  const { data, error } = await db.auth.signUp({ email: 'reg-test-' + ts + '@mail.ru', password: 'Test123456!' });
  console.log('SIGNUP user=' + (data?.user ? 'created' : 'null'));
  console.log('SIGNUP confSent=' + (data?.user?.confirmation_sent_at ? 'yes' : 'no'));
  console.log('SIGNUP session=' + (data?.session ? 'yes' : 'no'));
  if (error) console.log('SIGNUP ERR: ' + error.message + ' status=' + error.status);
} catch (e) {
  console.log('SIGNUP THROW: ' + e.message);
}
