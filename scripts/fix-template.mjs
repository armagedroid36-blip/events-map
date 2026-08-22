// Сменить шаблон письма подтверждения на код + поправить site_url. Вывод ASCII.
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
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
  Origin: 'https://supabase.com',
  Referer: 'https://supabase.com/',
};

// 1. Текущие значения
const cfg = await (await fetch('https://api.supabase.com/v1/projects/' + ref + '/config/auth', { headers })).json();
console.log('site_url=' + cfg.site_url);
console.log('subject_confirmation=' + (cfg.mailer_subjects_confirmation || 'EMPTY'));
console.log('template_len=' + (cfg.mailer_templates_confirmation_content || '').length);

// 2. Новый шаблон с кодом
const template =
  '<h2>Подтверждение регистрации</h2>' +
  '<p>Здравствуйте!</p>' +
  '<p>Ваш код подтверждения для сайта «События на карте»:</p>' +
  '<p style="font-size:26px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>' +
  '<p>Введите этот код в окне регистрации, чтобы завершить создание аккаунта.</p>' +
  '<p>Если вы не регистрировались — просто проигнорируйте это письмо.</p>';

const body = {
  site_url: 'https://armagedroid36-blip.github.io/events-map/',
  mailer_subjects_confirmation: 'Код подтверждения — События на карте',
  mailer_templates_confirmation_content: template,
};

const res = await fetch('https://api.supabase.com/v1/projects/' + ref + '/config/auth', {
  method: 'PATCH',
  headers,
  body: JSON.stringify(body),
});
const j = await res.json();
console.log('PATCH status=' + res.status);
console.log('site_url_now=' + j.site_url);
console.log('subject_now=' + (j.mailer_subjects_confirmation || 'EMPTY'));
console.log('template_now_len=' + (j.mailer_templates_confirmation_content || '').length);
if (!res.ok) console.log('PATCH BODY: ' + JSON.stringify(j).slice(0, 400));
