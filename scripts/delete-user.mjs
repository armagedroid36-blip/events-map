// Удаление пользователя Supabase по email (auth + профиль + история). Вывод ASCII.
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
const url = env.VITE_SUPABASE_URL || '';
const service = env.SUPABASE_SERVICE_ROLE || '';
const email = process.env.DEL_EMAIL || '';
if (!url || !service || !email) { console.log('MISSING url/service/email'); process.exit(1); }

const admin = createClient(url, service, { auth: { persistSession: false } });

// 1. Найти пользователя
const { data: users, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (lErr) { console.log('LIST ERR: ' + lErr.message); process.exit(1); }
const user = (users?.users ?? []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
if (!user) { console.log('USER NOT FOUND: ' + email); process.exit(0); }
console.log('FOUND id=' + user.id + ' email=' + user.email + ' confirmed=' + (user.email_confirmed_at ? 'yes' : 'no'));

// 2. Удалить профиль и связанные записи (если есть)
for (const table of ['profiles', 'history', 'applications']) {
  const { error } = await admin.from(table).delete().eq('user_id', user.id);
  if (error && !error.message.includes('does not exist')) console.log('DEL ' + table + ': ' + error.message);
}
const { error: pErr } = await admin.from('profiles').delete().eq('id', user.id);
if (pErr && !pErr.message.includes('does not exist')) console.log('DEL profiles(id): ' + pErr.message);

// 3. Удалить пользователя
const { error: dErr } = await admin.auth.admin.deleteUser(user.id);
if (dErr) { console.log('DELETE USER ERR: ' + dErr.message); process.exit(1); }
console.log('USER DELETED');
