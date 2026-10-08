// Дамп «хвоста» проблемного фрагмента: ищем, что именно делает тело невалидным.
import { createClient } from '@supabase/supabase-js';
import { eventTextForLlm } from './moderation-rules.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const { data } = await db.from('events').select('id,title,title_ru,title_en,description,description_ru,description_en').eq('status', 'moderation').limit(50);
const ev = (data || []).find((r) => r.id.startsWith('3e1b3531'));
const full = eventTextForLlm(ev).description;
for (const [a, b] of [[880, 1200], [900, 1200]]) {
  const d = full.slice(a, b);
  const body = JSON.stringify({ messages: [{ role: 'user', content: d }] });
  console.log(`\n[${a}:${b}] len ${d.length} bodyBytes ${Buffer.byteLength(body)} bodyChars ${body.length}`);
  console.log('tail:', JSON.stringify(body.slice(-70)));
  const bad = [];
  for (let i = 0; i < d.length; i++) {
    const c = d.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) bad.push(`суррогат@${i} U+${c.toString(16)} next U+${d.charCodeAt(i + 1).toString(16)}`);
    if (c === 0x5c) bad.push(`бэкслеш@${i} → ${JSON.stringify(d.slice(i, i + 12))}`);
  }
  console.log('подозрительное:', bad.length ? bad.join(' | ') : 'нет');
}
