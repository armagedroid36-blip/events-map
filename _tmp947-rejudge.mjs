// Замер 947: перепроверка очереди модерации НОВЫМ промптом судьи (без кэша auto_review).
// Для каждой карточки очереди печатает старый вердикт → новый.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname);
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const mod = await import('file://' + path.join(root, 'scripts', 'moderation-llm.mjs').replace(/\\/g, '/'));

const res = await fetch(`${URL_}/rest/v1/events?select=id,title,description,city,address,category_id,start_date,status,auto_review&status=eq.moderation&order=created_at.asc&limit=25`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const rows = await res.json();
console.log(`очередь: ${rows.length}`);

const cats = { concert: null, sport: null };
const catsRes = await fetch(`${URL_}/rest/v1/categories?select=id,name_ru,name_en`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const catList = await catsRes.json();
const catById = new Map(catList.map((c) => [c.id, c.name_ru || c.name_en]));

const flip = { publish: 0, review: 0, reject: 0 };
for (const r of rows) {
  const prev = (r.auto_review && r.auto_review.verdict) || '—';
  const out = await mod.judgeEventWithReason({
    title: r.title,
    description: r.description,
    city: r.city,
    address: r.address,
    category: catById.get(r.category_id) || null,
  });
  const nv = out.ok ? out.verdict : `ERR:${out.error || ''}`;
  flip[nv] = (flip[nv] || 0) + 1;
  console.log(`${r.id.slice(0, 8)} ${prev} → ${nv} | ${String(r.title).slice(0, 42)} | ${String(out.reason || '').slice(0, 80)}`);
}
console.log('ИТОГ', JSON.stringify(flip));
