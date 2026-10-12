// Точечный ремонт: интервал гастрольной карточки cyprus.bz заменяется на ДАТУ ПОКАЗА.
// Арбитр — описание записи ленты Cyprus Now (порядок дат по городам) / страница источника.
// Запуск: node --env-file=.env scripts/dot-cy-tour-enddate-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// titleLike | expectCityPrefix | expectStart | expectEnd | newEnd | цитата арбитра
const FIXES = [
  {
    titleLike: 'Luca Minnelli',
    expectCityPrefix: 'Никосия',
    expectStart: '2027-01-10',
    expectEnd: '2027-01-12',
    newEnd: '2027-01-10',
    quote: 'Cyprus Now, описание записи luca-minnelli-…-2027-01-10: «Θα εμφανιστεί στο Δημοτικό Θέατρο Λευκωσίας στις 10 Ιανουαρίου και στο Παττίχειο Θέατρο Λεμεσού στις 12 Ιανουαρίου» — в Никосии концерт 10.01, 12.01 это Лимасол (другой город), поэтому 12.01 не может быть датой окончания никосийской карточки; series_first = series_last = 2027-01-10.',
  },
];

let applied = 0, skipped = 0, errors = 0;
for (const f of FIXES) {
  const { data, error } = await db.from('events')
    .select('id,title,city,start_date,end_date,status,website')
    .ilike('title', `%${f.titleLike}%`)
    .eq('status', 'active');
  if (error) { console.log('ОШИБКА чтения:', f.titleLike, error.message); errors++; continue; }
  const rows = (data || []).filter(r => (r.city || '').startsWith(f.expectCityPrefix));
  if (rows.length !== 1) { console.log('ПРОПУСК (совпадений', rows.length, '):', f.titleLike); skipped++; continue; }
  const r = rows[0];
  if (String(r.start_date) !== f.expectStart || String(r.end_date) !== f.expectEnd) {
    console.log('ПРОПУСК (даты не те:', r.start_date, '->', r.end_date, '):', r.title, r.id);
    skipped++; continue;
  }
  console.log((APPLY ? 'ЗАПИСЬ' : 'ПЛАН'), r.id, '|', r.title, '|', r.start_date, '->', r.end_date, '=>', f.newEnd);
  console.log('   цитата:', f.quote.slice(0, 160) + '…');
  if (!APPLY) continue;
  const { data: upd, error: e2 } = await db.from('events').update({ end_date: f.newEnd }).eq('id', r.id).select('id,start_date,end_date,city,title');
  if (e2) { console.log('  ОШИБКА записи:', e2.message); errors++; continue; }
  if (!upd || upd.length !== 1) { console.log('  ОШИБКА: обновлено строк', upd ? upd.length : 0); errors++; continue; }
  console.log('  контроль:', JSON.stringify(upd[0]));
  applied++;
}
console.log(`ИТОГО применено ${applied}, пропущено ${skipped}, ошибок ${errors}`);
