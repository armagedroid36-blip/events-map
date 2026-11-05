// Ремонт 713: живые недельные записи деревень под живыми сезонными агрегатами.
// node --env-file=.env scripts/dot-cy-village-weekly-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { buildVillageAggregates, coveredByVillageSeries } from './village-series.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const cols = 'id,status,title,title_ru,title_en,start_date,end_date,city,website';

const { data: agRows, error: e1 } = await db.from('events').select(cols).in('status', ['active', 'moderation', 'needs_changes']).ilike('title', '%Village%');
if (e1) throw new Error(e1.message);
const aggs = buildVillageAggregates(agRows || []);
const { data: cands, error: e2 } = await db.from('events').select(cols).eq('status', 'active').ilike('title', '%Χωρι%');
if (e2) throw new Error(e2.message);

const hit = (cands || []).filter((c) => coveredByVillageSeries(aggs, c));
console.log(`агрегатов ${aggs.length}, живых «Χωρι…» ${(cands || []).length}, под агрегатом ${hit.length}`);
for (const c of cands || []) {
  const cov = coveredByVillageSeries(aggs, c);
  console.log(`  ${cov ? 'СНЯТЬ ' : 'оставить'} ${c.id.slice(0, 8)} ${c.title.slice(0, 50)} ${c.start_date}..${c.end_date || ''} ${c.city}`);
}
if (!hit.length) { console.log('нечего снимать'); process.exit(0); }
if (!APPLY) { console.log('\nDRY: запуск с --apply снимет перечисленные'); process.exit(0); }

const { data: upd, error: e3 } = await db.from('events')
  .update({ status: 'archived', auto_review: { engine: 'dot-manual', verdict: 'reject', reason: 'duplicate: день сезонного агрегата рождественской деревни (класс 687)', at: new Date().toISOString() } })
  .in('id', hit.map((h) => h.id)).eq('status', 'active').select('id,status,title');
if (e3) throw new Error(e3.message);
console.log(`\narchived: ${(upd || []).length}`);
for (const u of upd || []) console.log('  -', u.id.slice(0, 8), u.title.slice(0, 50));
