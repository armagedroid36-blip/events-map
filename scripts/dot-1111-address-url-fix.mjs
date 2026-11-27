#!/usr/bin/env node
// dot-1111: в адресе карточки торчит ссылка на карту.
// Кейс: bcbfd122 «Marathon Expo … Pafos Castle, https://maps.app.goo.gl/…» (TUI Cyprus Marathon).
// Корень закрыт в коде: stripAddressLabel() вырезает URL из адреса (scripts/address-junk.mjs).
// Этот скрипт правит уже собранную строку. DRY по умолчанию, APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { cleanAddress } from './address-junk.mjs';

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL_ || !KEY) { console.error('нет ключей (.env)'); process.exit(2); }
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';
const TARGET = 'bcbfd122';

const { data, error } = await db.from('events')
  .select('id,title,address,status')
  .eq('status', 'active')
  .ilike('address', '%http%')
  .limit(50);
if (error) {
  const q = /egress/i.test(error.message || '');
  console.error('ОШИБКА чтения:', error.message, q ? '— 402 egress quota: ремонт отменён' : '');
  process.exit(q ? 1 : 2);
}
const row = (data || []).find((r) => String(r.id).startsWith(TARGET));
if (!row) { console.error('цель не найдена (не active)'); process.exit(1); }
const fixed = cleanAddress(row.address);
console.log(`${row.id.slice(0, 8)} «${String(row.title).slice(0, 60)}»`);
console.log('  было:', JSON.stringify(row.address));
console.log('  станет:', JSON.stringify(fixed));
if (!fixed || fixed === row.address) { console.log('править нечего'); process.exit(0); }
if (!APPLY) { console.log('DRY — запись не делалась (APPLY=1)'); process.exit(0); }

const { data: upd, error: e2 } = await db.from('events')
  .update({ address: fixed, auto_review: { verdict: 'publish', reason: 'address-fix', note: 'dot 1111: ссылка вырезана из адреса' } })
  .eq('id', row.id).eq('status', 'active')
  .select('id,address,status');
if (e2 || !upd?.length) { console.error('ОШИБКА записи:', e2?.message || '0 строк'); process.exit(1); }
console.log('readback:', upd[0].id.slice(0, 8), upd[0].status, JSON.stringify(upd[0].address));
