// Рассылка подписчикам организаторов о новых событиях (email).
// Ежедневно (workflow notify-subscribers.yml, cron 04:00 UTC):
// для каждой подписки ищем активные события организатора, созданные
// за последние N часов (константа PERIOD_HOURS), шлём одно письмо
// на email со списком событий и ссылкой отписки по токену.
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// Период: события, созданные за последние N часов
const PERIOD_HOURS = 24;
const SITE_URL = 'https://armagedroid36-blip.github.io/events-map/';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Убираем переводы строк — защита от SMTP-инъекции через заголовки
function cleanLine(s) {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

async function sendEmail(to, subject, text) {
  const smtpOk = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS;
  if (!smtpOk) {
    console.warn('Email пропущен: SMTP_* не заданы');
    return false;
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: SMTP_USER,
    to,
    subject,
    text,
  });
  console.log(`Email: отправлено на ${to}`);
  return true;
}

async function main() {
  const since = new Date(Date.now() - PERIOD_HOURS * 3600 * 1000).toISOString();

  // 1. Подписки + события за период + имена организаторов
  const [subsRes, eventsRes, orgsRes] = await Promise.all([
    db.from('org_subscriptions').select('email, unsub_token, org_id'),
    db
      .from('events')
      .select('owner_id, title, title_ru, title_en, start_date, city')
      .eq('status', 'active')
      .gte('created_at', since),
    db.from('profiles').select('id, display_name'),
  ]);
  if (subsRes.error) throw subsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (orgsRes.error) throw orgsRes.error;

  const subs = subsRes.data || [];
  const events = eventsRes.data || [];
  const orgNames = {};
  for (const o of orgsRes.data || []) orgNames[o.id] = o.display_name;

  if (!subs.length) {
    console.log('Подписчиков нет');
    return;
  }
  if (!events.length) {
    console.log('Новых событий за период нет');
    return;
  }

  // 2. Группировка по email: события по организаторам
  const byEmail = new Map(); // email -> { token, orgs: Map<orgId, events[]> }
  for (const s of subs) {
    const em = s.email.toLowerCase();
    if (!byEmail.has(em)) byEmail.set(em, { token: s.unsub_token, orgs: new Map() });
  }
  for (const ev of events) {
    const em = subs.find((s) => s.org_id === ev.owner_id)?.email;
    if (!em) continue; // событие организатора без подписчиков — не интересно
    const bucket = byEmail.get(em.toLowerCase());
    if (!bucket.orgs.has(ev.owner_id)) bucket.orgs.set(ev.owner_id, []);
    bucket.orgs.get(ev.owner_id).push(ev);
  }

  // 3. Письма
  let sent = 0;
  for (const [em, bucket] of byEmail) {
    if (!bucket.orgs.size) continue;
    const lines = ['Здравствуйте!', '', 'Новые события на карте:'];
    for (const [orgId, evs] of bucket.orgs) {
      const orgName = orgNames[orgId] || 'Организатор';
      lines.push('', `${orgName}:`);
      for (const ev of evs) {
        const title = cleanLine(ev.title_ru || ev.title_en || ev.title || 'Без названия');
        const parts = [title];
        if (ev.start_date) parts.push(ev.start_date);
        if (ev.city) parts.push(ev.city);
        lines.push(`• ${parts.join(' — ')}`);
      }
    }
    lines.push('', `Все события: ${SITE_URL}`, '');
    lines.push(`Отписаться от рассылки: ${SITE_URL}#/unsubscribe?token=${bucket.token}`);
    const firstOrgName = orgNames[[...bucket.orgs.keys()][0]] || 'Организатор';
    const subject = cleanLine(`Новые события: ${firstOrgName}`);
    try {
      if (await sendEmail(em, subject, lines.join('\n'))) sent++;
    } catch (e) {
      console.error(`Email ошибка для ${em}:`, e.message);
    }
  }
  console.log(`Писем отправлено: ${sent} из ${byEmail.size}`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
