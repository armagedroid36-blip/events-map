// Читающий зонд: живые карточки Cyprus Now, у которых ОДНО событие лежит
// ДВУМЯ страницами источника (разные слаги) — подкласс, найденный запуском 119
// (Lotus Parable: слаг с городом vs слаг без города, метки в РАЗНЫХ городах).
// Признак группы: одна дата + пересечение значимых слов названия >= 2 + разные слаги.
// Базу не меняет.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const STOP = new Set([
  'the','and','of','in','at','a','an','to','for','with','night','label','festival',
  '2026','2025','2027','cyprus','limassol','nicosia','larnaca','paphos','party',
  'live','show','day','vol','vs','on','outdoor','gathering','event','events',
]);

const toks = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

const slugOf = (u) => {
  const m = String(u || '').match(/cyprusnow\.app\/(?:ru\/)?event\/([^/?#]+)/);
  return m ? m[1] : '';
};

const live = await selectAll(
  db,
  'events',
  'id, title, title_ru, title_en, start_date, start_time, city, address, website, status, lat, lng',
  { filter: (q) => q.in('status', ['active', 'moderation']) },
);
const cn = live.filter((e) => (e.website || '').includes('cyprusnow.app/event/'));
console.log(`живых ${live.length}, cyprusnow-карточек ${cn.length}`);

const byDate = new Map();
for (const e of cn) {
  const d = `${String(e.start_date || '')}|${String(e.start_time || '')}`;
  if (!byDate.has(d)) byDate.set(d, []);
  byDate.get(d).push(e);
}

const groups = [];
for (const [date, arr] of byDate) {
  const used = new Set();
  for (let i = 0; i < arr.length; i++) {
    if (used.has(i)) continue;
    const cluster = [arr[i]];
    const base = new Set([...toks(arr[i].title), ...toks(arr[i].title_ru), ...toks(arr[i].title_en)]);
    for (let j = i + 1; j < arr.length; j++) {
      if (used.has(j)) continue;
      const other = new Set([...toks(arr[j].title), ...toks(arr[j].title_ru), ...toks(arr[j].title_en)]);
      let ov = 0;
      for (const t of other) if (base.has(t)) ov++;
      if (ov >= 2) {
        cluster.push(arr[j]);
        used.add(j);
      }
    }
    if (cluster.length >= 2) {
      const slugs = new Set(cluster.map((e) => slugOf(e.website)));
      if (slugs.size >= 2) groups.push({ date, cluster });
      used.add(i);
    }
  }
}

console.log(`групп «одна дата + 2 общих слова + разные слаги»: ${groups.length}`);
for (const g of groups) {
  console.log(`\n=== ${g.date}`);
  for (const e of g.cluster) {
    console.log(
      `  ${e.id} [${e.status}] ${e.city} | ${e.start_time} | ${e.title} | ${e.address || '-'} | ` +
        `${e.lat},${e.lng} | ${slugOf(e.website)}`,
    );
  }
}
