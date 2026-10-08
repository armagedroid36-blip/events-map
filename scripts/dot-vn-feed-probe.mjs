// Покрытие Вьетнама (Дананг/Нячанг): живые карточки vs последние посты TG-афиш.
// Локально: curl -x http://127.0.0.1:10809 https://t.me/s/<канал> -o %LOCALAPPDATA%/Temp/tf_<канал>.html
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const tmp = process.env.LOCALAPPDATA + '\\Temp';
const CH = [['danang_afisha', 'Дананг'], ['nyachang_ru', 'Нячанг']];

const rows = await selectAll(db, 'events', 'id,status,city,title,title_ru,start_date,end_date,website', {
  filter: q => q.in('status', ['active', 'moderation']),
});
const vn = rows.filter(r => /Дананг|Нячанг/i.test(String(r.city || '')));
console.log('Живых карточек Вьетнама:', vn.length, '| по городам:',
  Object.entries(vn.reduce((a, r) => (a[r.city] = (a[r.city] || 0) + 1, a), {})).map(([c, n]) => `${c} ${n}`).join(', '));

const norm = s => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]/gi, '').slice(0, 40);
const haveTitles = new Set();
for (const r of vn) { haveTitles.add(norm(r.title)); haveTitles.add(norm(r.title_ru)); }

for (const [channel, city] of CH) {
  let html = '';
  try { html = readFileSync(`${tmp}\\tf_${channel}.html`, 'utf8'); } catch { console.log(`\n== ${channel}: файл не скачан`); continue; }
  const blocks = html.split('<div class="tgme_widget_message ').slice(1);
  const baseUrls = new Set(vn.map(r => String(r.website || '')));
  const posts = [];
  for (const b of blocks) {
    const post = (b.match(/data-post="([^"]+)"/) || [])[1];
    const dt = (b.match(/datetime="([^"]+)"/) || [])[1];
    const textHtml = (b.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
    const text = textHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (dt) posts.push({ dt, post, text: text.trim() });
  }
  const dates = posts.map(p => p.dt.slice(0, 10)).sort();
  console.log(`\n== t.me/${channel} (метка ${city}): постов ${posts.length}, ${dates[0]} .. ${dates[dates.length - 1]}`);
  const today = new Date().toISOString().slice(0, 10);
  let inBase = 0, missing = 0;
  for (const p of posts) {
    const url = `https://t.me/${channel}/${String(p.post).split('/')[1]}`;
    const hit = baseUrls.has(url);
    const evDate = (p.text.match(/(\d{2})[.\-/](\d{2})(?:[.\-/](\d{2,4}))?/) || [])[0] || '-';
    if (hit) inBase++; else missing++;
    if (!hit) console.log(`   НЕТ В БАЗЕ ${p.dt.slice(0, 10)} пост=${p.post} датасобытия=${evDate} "${(p.text.split('\n').map(s => s.trim()).filter(Boolean)[0] || '').slice(0, 55)}"`);
  }
  console.log(`   из витрины канала: уже в базе ${inBase}, НЕТ ${missing}`);
}
