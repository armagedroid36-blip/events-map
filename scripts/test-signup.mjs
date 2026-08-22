// Поднять rate_limit_email_sent и проверить signUp. Вывод ASCII.
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
if (!ref || !PAT) { console.log('MISSING ref/pat'); process.exit(1); }

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
    body: JSON.stringify({ rate_limit_email_sent: 10 }),
  });
  const j = await res.json();
  console.log('PATCH rate_limit status=' + res.status + ' rate_limit_email_sent=' + j.rate_limit_email_sent);
} catch (e) {
  console.log('PATCH ERR: ' + e.message);
}

try {
  const db = createClient(url, anon, { auth: { persistSession: false } });
  const ts = Date.now();
  const { data, error } = await db.auth.signUp({ email: 'reg-test3-' + ts + '@mail.ru', password: 'Test123456!' });
  console.log('SIGNUP user=' + (data?.user ? 'created' : 'null'));
  console.log('SIGNUP confSent=' + (data?.user?.confirmation_sent_at ? 'yes' : 'no'));
  console.log('SIGNUP session=' + (data?.session ? 'yes' : 'no'));
  if (error) console.log('SIGNUP ERR: ' + error.message + ' status=' + error.status);
} catch (e) {
  console.log('SIGNUP THROW: ' + e.message);
}
