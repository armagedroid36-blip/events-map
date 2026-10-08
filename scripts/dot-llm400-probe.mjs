// Разбор корня HTTP 400 «Failed to parse the request body as JSON» у LLM-судьи.
// Читает карточку(и) и проверяет текст на непарные суррогаты / управляющие символы.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('нет ключей'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const IDS = (process.env.IDS || '3e1b3531').split(',').map((s) => s.trim()).filter(Boolean);

function scan(label, text) {
  const s = String(text ?? '');
  const bad = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) bad.push({ type: 'lone-high', i, code: c.toString(16) });
      else i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) bad.push({ type: 'lone-low', i, code: c.toString(16) });
    else if (c < 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) bad.push({ type: 'ctrl', i, code: c.toString(16) });
  }
  const j = JSON.stringify({ t: s });
  const round = (() => { try { return JSON.parse(j) ? 'ok' : 'ok'; } catch (e) { return 'FAIL ' + e.message; } })();
  console.log(`${label}: длина ${s.length}, подозрительных ${bad.length}, JSON.parse(JSON.stringify) ${round}`);
  if (bad.length) console.log('  ', JSON.stringify(bad.slice(0, 5)));
  return bad;
}

for (const id of IDS) {
  const { data, error } = await db.from('events')
    .select('id,status,title,title_ru,description,description_ru,city,address,website,source_type')
    .eq('status', 'moderation');
  if (error) { console.error(id, 'ошибка:', error.message); continue; }
  for (const r of data || []) {
    console.log(`\n=== ${r.id.slice(0, 8)} [${r.status}] ${String(r.title).slice(0, 60)}`);
    for (const f of ['title', 'title_ru', 'description', 'description_ru', 'city', 'address']) {
      const bad = scan('  ' + f, r[f]);
      if (bad.length) {
        const i = bad[0].i;
        console.log('    фрагмент:', JSON.stringify(String(r[f]).slice(Math.max(0, i - 25), i + 25)));
      }
    }
  }
}
