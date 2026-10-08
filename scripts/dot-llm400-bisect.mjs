// Бисекция: какой фрагмент content ломает парсер DeepSeek (HTTP 400 hex escape)
import { createClient } from '@supabase/supabase-js';
import { eventTextForLlm } from './moderation-rules.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const KEY = process.env.DEEPSEEK_API_KEY;

const { data } = await db.from('events')
  .select('id,title,title_ru,title_en,description,description_ru,description_en,city,address,category_id,website')
  .eq('status', 'moderation').limit(50);
const ev = (data || []).find((r) => r.id.startsWith('3e1b3531'));
if (!ev) { console.error('карточка не найдена'); process.exit(1); }
const card = eventTextForLlm(ev);

async function probe(label, content) {
  const body = JSON.stringify({
    model: 'deepseek-chat', temperature: 0, max_tokens: 8,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content }],
  });
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body,
  });
  const t = await r.text();
  const bad = /hex escape|parse the request body/.test(t);
  console.log(`${bad ? 'FAIL' : 'ok  '} ${String(label).padEnd(34)} тело ${String(Buffer.byteLength(body)).padStart(5)} | ${bad ? t.slice(0, 130) : t.slice(0, 60)}`);
  return !bad;
}

console.log('полная строка карточки:', card.title.length, '/', card.description.length);
if (await probe('полный content (как в судье)', `Название: ${card.title}\nКатегория: ${card.category || '—'}\nГород: ${card.city || '—'}\nАдрес: ${card.address || '—'}\nСсылка: ${card.website || '—'}\nОписание: ${card.description}`)) process.exit(0);
await probe('только title', card.title);
const d = card.description;
for (let i = 0; i < d.length; i += 300) {
  await probe(`описание [${i}:${i + 300}]`, d.slice(i, i + 300));
}
// отдельные поля-источники
for (const f of ['description', 'description_ru', 'description_en', 'title', 'address', 'website']) {
  if (ev[f]) await probe(`поле ${f} целиком`, String(ev[f]).slice(0, 1200));
}
