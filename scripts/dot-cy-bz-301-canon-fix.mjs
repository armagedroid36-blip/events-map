// dot-cy-bz-301-canon-fix.mjs — ремонт ссылки источника у живых карточек cyprus.bz,
// чья страница в поле website отдаёт 301 (источник переклеил страницу).
// Применяем ТОЛЬКО когда: карточка живая, редирект уводит на 200, в теле канонической
// страницы есть токен события (та же серия), и канонический URL ещё не занят другой
// ЖИВОЙ карточкой (иначе ссылка вела бы на чужой показ тура).
// Запуск: node --env-file=.env scripts/dot-cy-bz-301-canon-fix.mjs [APPLY=1]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TARGETS = [
  { id: '08fdfad2', token: 'Bubble' },      // The Mr and Mrs Bubble Show, Никосия 14.11
  { id: '78eb1c5c', token: 'Rudolph' },     // Rudolph's Magical Christmas, тур
  { id: '99598ed0', token: 'OlympusMan' },  // OlympusMan Triathlon 2026
];

const rows = await selectAll(db, 'events', 'id,title,start_date,city,website,status');
let applied = 0, skipped = 0, errors = 0;
for (const t of TARGETS) {
  const card = rows.find((r) => r.id.startsWith(t.id));
  if (!card) { console.log(`${t.id}: карточки нет`); skipped++; continue; }
  if (card.status !== 'active' && card.status !== 'moderation') { console.log(`${t.id}: статус ${card.status} — пропуск`); skipped++; continue; }
  let canon = '', status = 0, html = '';
  try {
    // curl вместо fetch: крупные страницы Cloudflare с RU-IP рвут fetch («terminated»)
    const tmp = `${process.env.LOCALAPPDATA.replace(/\\/g, '/')}/Temp/bz301_${t.id}.html`;
    const r = spawnSync('curl', ['-sL', '--max-time', '25', '-o', tmp, '-w', '%{http_code} %{url_effective}', card.website], { encoding: 'utf8' });
    const out = String(r.stdout || '').trim();
    if (!out) throw new Error(r.stderr || `curl status ${r.status}`);
    const [code, ...rest] = out.split(' ');
    status = Number(code); canon = rest.join(' ');
    html = readFileSync(tmp, 'utf8');
  } catch (e) { console.log(`${t.id}: сеть — ${e.message}`); errors++; continue; }
  const moved = canon && canon !== card.website;
  const tokenOk = html.includes(t.token);
  const takenByLive = rows.some((r) => r.website === canon && r.id !== card.id && (r.status === 'active' || r.status === 'moderation'));
  console.log(`${t.id} | ${status} | moved=${moved} token=${tokenOk ? 'OK' : 'НЕТ'} занят живой=${takenByLive} -> ${canon}`);
  if (!(status === 200 && moved && tokenOk && !takenByLive)) { skipped++; continue; }
  if (!APPLY) { console.log('   DRY: к записи'); continue; }
  const upd = await db.from('events').update({ website: canon }).eq('id', card.id).select('id,website');
  if (upd.error || !upd.data?.length) { console.log('   ОШИБКА:', upd.error?.message || '0 строк'); errors++; }
  else { applied++; console.log('   применено ->', upd.data[0].website); }
}
console.log(`\nИтог: применено ${applied}, пропущено ${skipped}, ошибок ${errors}${APPLY ? '' : ' (DRY)'}`);
