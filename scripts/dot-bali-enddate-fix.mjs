// Ремонт данных: у карточек Бали (baliforum) с НЕСКОЛЬКИМИ датами в ленте,
// но пустым end_date, событие на карте показывается одним днём. Ставим end_date
// только там, где диапазон подтверждён названием события (выставка/чемпионат),
// и НЕ трогаем регулярные серии занятий/вечеринок (у них есть recurrence).
// DRY по умолчанию, APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const APPLY = process.env.APPLY === '1';

// id (8 знаков) -> { end: последняя дата ленты, evidence: цитата названия }
const FIX = {
  '1ca1e13d': { end: '2026-11-29', evidence: 'выставка в Nuanu до 29 ноября' },   // лента: 56 дат 05.10–29.11
  'e27d1703': { end: '2026-10-11', evidence: 'Чемпионат Сават Бали в Табанане 10–11 октября' }, // лента: 2 даты
};

const ALL = { data: await selectAll(db, 'events', 'id,title,title_ru,city,start_date,end_date,status,recurrence,website',
  { filter: q => q.in('status', ['active', 'moderation', 'needs_changes']) }) };
if (ALL.error) console.log('ОШИБКА ЧТЕНИЯ СПИСКА', ALL.error.message);

for (const [shortId, fix] of Object.entries(FIX)) {
  const r = (ALL.data || []).find(x => String(x.id).startsWith(shortId));
  if (!r) { console.log(`${shortId}: НЕ НАЙДЕНО`); continue; }
  const title = `${r.title_ru || ''} ${r.title || ''}`;
  const check = [
    r.status === 'active' || r.status === 'moderation',
    (r.city || '').includes('Bali'),
    !r.end_date,
    !r.recurrence,
    r.start_date < fix.end,
    fix.evidence.split(/[\s–-]+/).filter(w => w.length > 3).some(w => title.toLowerCase().includes(w.toLowerCase())),
  ];
  if (check.some(c => !c)) { console.log(`${shortId}: ПРОПУСК (страховка ${check.map((c, i) => c ? '' : i).filter(Boolean).join(',')}) — ${title.slice(0, 50)} | ${r.status} | ${r.start_date} → ${r.end_date} | rec=${!!r.recurrence}`); continue; }
  if (!APPLY) { console.log(`${shortId}: DRY OK — ${r.start_date} → ${fix.end} | ${title.slice(0, 55)}`); continue; }
  const { data: upd, error: e2 } = await db.from('events').update({ end_date: fix.end }).eq('id', r.id).select('id,end_date');
  console.log(`${shortId}: ${e2 ? 'ОШИБКА ' + e2.message : (upd?.length ? `ЗАПИСАНО ${r.start_date} → ${upd[0].end_date}` : 'НЕ ЗАПИСАНО (0 строк)')} | ${title.slice(0, 55)}`);
}
