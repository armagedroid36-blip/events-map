#!/usr/bin/env node
// dot-1113: двойные пробелы в НАЗВАНИЯХ живых карточек («Pangolin Creative Workshop:  Plaster…»).
// Корень закрыт в scripts/collect-megatix.mjs (заголовок и описание идут через cleanCardText,
// который схлопывает пробелы и раскодирует сущности) — здесь разовый ремонт трёх строк,
// собранных до правки.
// DRY по умолчанию; APPLY=1 пишет. При 402 (egress quota) выходит с кодом 1 и ничего не пишет.
import { cleanCardText } from './text-safe.mjs';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }
const APPLY = process.env.APPLY === '1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' };

// Адреса целей зафиксированы — скрипт не должен трогать чужие строки.
const TARGETS = ['01c74dd1', '6a9931bd', 'e49c85fc'];

async function readActive(select) {
  const r = await fetch(`${URL}/rest/v1/events?status=eq.active&select=${select}`, { headers: H });
  const body = await r.text();
  if (r.status === 402 || /exceed_egress_quota/.test(body)) {
    console.error('402 egress quota — ремонт отменён:', body.slice(0, 120));
    process.exit(1);
  }
  if (!r.ok) { console.error('чтение:', r.status, body.slice(0, 120)); process.exit(1); }
  return JSON.parse(body);
}

(async () => {
  const rows = await readActive('id,title,title_ru,title_en');
  const byPrefix = new Map(rows.map((r) => [r.id.slice(0, 8), r]));
  console.log(`живых прочитано: ${rows.length}, целей: ${TARGETS.length}`);

  let planned = 0;
  for (const p of TARGETS) {
    const row = byPrefix.get(p);
    if (!row) { console.log(`MISS ${p} — карточка не active`); continue; }
    const patch = {};
    for (const field of ['title', 'title_ru', 'title_en']) {
      const cur = row[field];
      if (typeof cur !== 'string' || !cur) continue;
      const fixed = cleanCardText(cur);
      if (fixed && fixed !== cur) patch[field] = fixed;
    }
    if (!Object.keys(patch).length) { console.log(`SKIP ${p} — пробелов нет`); continue; }
    for (const [f, v] of Object.entries(patch)) {
      console.log(`${APPLY ? 'PATCH' : 'DRY'} ${p} ${f}: ${JSON.stringify(row[f])} -> ${JSON.stringify(v)}`);
    }
    planned++;
    if (!APPLY) continue;
    const r = await fetch(`${URL}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    const out = await r.text();
    if (!r.ok) { console.error(`PATCH ${p} не прошёл:`, r.status, out.slice(0, 140)); continue; }
    const back = JSON.parse(out)[0];
    console.log(`readback ${p}: ${JSON.stringify(back.title)}`);
  }
  console.log(`${APPLY ? 'исправлено' : 'к ремонту'}: ${planned} из ${TARGETS.length}`);
})();
