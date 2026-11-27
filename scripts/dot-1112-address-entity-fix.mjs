#!/usr/bin/env node
// dot-1112: адреса живых карточек с HTML-сущностями («Lady&#8217;s Mile Beach»).
// Корень закрыт в cleanCardText() (scripts/text-safe.mjs) — здесь разовый ремонт данных.
// DRY по умолчанию; APPLY=1 пишет. При 402 (egress quota) выходит с кодом 1 и ничего не пишет.
import { cleanCardText } from './text-safe.mjs';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) { console.error('нет SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }
const APPLY = process.env.APPLY === '1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  let rows;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${URL}/rest/v1/events?status=eq.active&select=id,address&address=like.*%26%23*`, { headers: H });
    if (r.ok) { rows = await r.json(); break; }
    const body = await r.text();
    if (r.status === 402 || /exceed_egress_quota/.test(body)) {
      console.error('402 egress quota — ремонт отменён:', body.slice(0, 120)); process.exit(1);
    }
    console.error('чтение:', r.status, body.slice(0, 120));
    await new Promise((res) => setTimeout(res, 1500));
  }
  if (!rows) { console.error('не удалось прочитать адреса'); process.exit(1); }
  console.log(`кандидатов: ${rows.length}`);
  let changed = 0;
  for (const row of rows) {
    const fixed = cleanCardText(row.address);
    if (!fixed || fixed === row.address) { console.log(`SKIP ${row.id.slice(0, 8)} ${row.address}`); continue; }
    console.log(`${APPLY ? 'PATCH' : 'DRY'} ${row.id.slice(0, 8)}: ${row.address} -> ${fixed}`);
    if (!APPLY) { changed++; continue; }
    const r = await fetch(`${URL}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ address: fixed }),
    });
    const out = await r.text();
    if (!r.ok) { console.error('PATCH не прошёл:', r.status, out.slice(0, 120)); continue; }
    changed++;
  }
  console.log(`${APPLY ? 'исправлено' : 'к ремонту'}: ${changed} из ${rows.length}`);
})();
