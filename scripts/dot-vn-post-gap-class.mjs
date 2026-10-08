// Классификация постов канала, которых нет в базе по URL: событие есть под другим URL / дата в прошлом / нет даты.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const tmp = process.env.LOCALAPPDATA + '\\Temp';
const CH = [['danang_afisha', 'Дананг'], ['nyachang_ru', 'Нячанг']];

const live = await selectAll(db, 'events', 'id,status,city,title,title_ru,start_date,website', { filter: q => q.in('status', ['active', 'moderation']) });
const vn = live.filter(r => /Дананг|Нячанг/i.test(String(r.city || '')));
const urls = new Set(vn.map(r => String(r.website || '')));
const words = s => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 3);

for (const [channel, city] of CH) {
  const html = readFileSync(`${tmp}\\tf_${channel}.html`, 'utf8');
  const blocks = html.split('<div class="tgme_widget_message ').slice(1);
  console.log(`\n== t.me/${channel} (${city})`);
  let cls = { inBase: 0, otherUrl: 0, noDate: 0, future: 0 };
  for (const b of blocks) {
    const post = (b.match(/data-post="([^"]+)"/) || [])[1];
    const dt = (b.match(/datetime="([^"]+)"/) || [])[1];
    if (!post || !dt) continue;
    const num = post.split('/')[1];
    const url = `https://t.me/${channel}/${num}`;
    if (urls.has(url)) { cls.inBase++; continue; }
    const raw = ((b.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const first = (lines[0] || '').slice(0, 50);
    // дата события в тексте: dd.mm[.yyyy] или «сегодня»
    const dates = (raw.match(/\b\d{1,2}[.\-/]\d{1,2}(?:[.\-/]\d{2,4})?\b/g) || []).slice(0, 3).join(',');
    const sig = words(first);
    const match = vn.find(r => {
      const t = new Set([...words(r.title), ...words(r.title_ru)]);
      const ov = sig.filter(w => t.has(w)).length;
      return ov >= 2;
    });
    if (match) { cls.otherUrl++; console.log(`   [есть под другим URL] ${num} "${first}" -> ${match.id.slice(0, 8)} ${match.start_date} "${String(match.title).slice(0, 35)}" (${(match.website || '').split('/').slice(-2).join('/')})`); }
    else if (!dates && !/сегодня|завтра/i.test(raw)) { cls.noDate++; console.log(`   [нет даты] ${num} "${first}"`); }
    else { cls.future++; console.log(`   [НЕТ СОБЫТИЯ] ${num} ${dt.slice(0, 10)} даты=${dates} "${first}" url=${url}`); }
  }
  console.log(`   итог: в базе по URL ${cls.inBase} | есть под другим URL ${cls.otherUrl} | нет даты ${cls.noDate} | НЕТ СОБЫТИЯ ${cls.future}`);
}
