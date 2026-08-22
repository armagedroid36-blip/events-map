// Проверка состояния auth в Supabase: таблицы, RPC, конфиг. Вывод ASCII.
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
const service = env.SUPABASE_SERVICE_ROLE || '';
const anon = env.VITE_SUPABASE_ANON_KEY || '';
console.log('ENV: url=' + (url ? 'ok' : 'MISSING') + ' service=' + (service ? 'ok' : 'MISSING') + ' anon=' + (anon ? 'ok' : 'MISSING'));
if (!url || !service) process.exit(1);

const db = createClient(url, service, { auth: { persistSession: false } });

// 1. OpenAPI schema: какие таблицы есть
try {
  const res = await fetch(url + '/rest/v1/', {
    headers: { apikey: service, Authorization: 'Bearer ' + service },
  });
  const schema = await res.json();
  const defs = schema.components?.schemas ?? {};
  const tables = Object.keys(defs).filter((k) => !k.startsWith('_'));
  console.log('TABLES: ' + tables.join(', '));
  const prof = defs.Profiles ?? defs.profiles;
  if (prof) {
    const props = Object.keys(prof.properties ?? {});
    console.log('PROFILES COLS: ' + props.join(', '));
  } else {
    console.log('PROFILES COLS: NOT FOUND');
  }
} catch (e) {
  console.log('SCHEMA ERR: ' + e.message);
}

// 2. RPC create_profile: существует ли
try {
  const { data, error } = await db.rpc('create_profile', {
    uid: '00000000-0000-0000-0000-000000000000',
    p_role: 'user',
    tg: '', wa: '', em: '', ph: '', ig: '',
  });
  console.log('RPC create_profile: data=' + JSON.stringify(data) + ' err=' + (error ? error.message : 'none'));
} catch (e) {
  console.log('RPC create_profile THROW: ' + e.message);
}

// 3. Auth settings: autoconfirm почты (косвенно)
try {
  const res = await fetch(url + '/auth/v1/settings', {
    headers: { apikey: anon, Authorization: 'Bearer ' + anon },
  });
  const s = await res.json();
  console.log('AUTH SETTINGS: ' + JSON.stringify(s).slice(0, 300));
} catch (e) {
  console.log('AUTH SETTINGS ERR: ' + e.message);
}

// 4. Проверка: что вернёт signUp на тестовый email (не отправляет ничего опасного)
try {
  const anonDb = createClient(url, anon, { auth: { persistSession: false } });
  const ts = Date.now();
  const { data, error } = await anonDb.auth.signUp({
    email: 'test-reg-' + ts + '@cozyloftt.yandex.ru',
    password: 'Test123456!',
  });
  console.log('SIGNUP: user=' + (data?.user ? 'created' : 'null') + ' session=' + (data?.session ? 'yes' : 'no') + ' confSent=' + (data?.user?.confirmation_sent_at ? 'yes' : 'no'));
  if (error) console.log('SIGNUP ERR: ' + error.message + ' status=' + error.status);
} catch (e) {
  console.log('SIGNUP THROW: ' + e.message);
}
