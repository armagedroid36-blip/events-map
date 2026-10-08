// Живой повтор запроса LLM-судьи по карточке, где раньше был HTTP 400
// «unexpected end of hex escape». Печатает размер тела и ответ.
import { createClient } from '@supabase/supabase-js';
import { eventTextForLlm } from './moderation-rules.mjs';
import { judgeEventWithReason } from './moderation-llm.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const COLS = 'id,status,title,title_ru,title_en,description,description_ru,description_en,city,address,category_id,website';
const ids = (process.env.IDS || '3e1b3531,e48eb457,aa782747,136e009b,ce092797').split(',');

const { data, error } = await db.from('events').select(COLS).eq('status', 'moderation').limit(50);
if (error) { console.error('чтение:', error.message); process.exit(1); }

const wanted = (data || []).filter((r) => ids.some((p) => r.id.startsWith(p)));
console.log('найдено карточек moderation из списка:', wanted.length);
for (const ev of wanted) {
  const card = eventTextForLlm(ev);
  const probe = JSON.stringify({
    model: 'deepseek-chat', temperature: 0, max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: `Название: ${card.title}\nОписание: ${card.description}` }],
  });
  console.log(`\n${ev.id.slice(0, 8)} тело ${Buffer.byteLength(probe)} байт, описание ${card.description.length} симв.`);
  const t0 = Date.now();
  const res = await judgeEventWithReason(card);
  console.log('  результат:', JSON.stringify(res).slice(0, 300), `(${Date.now() - t0} мс)`);
}
