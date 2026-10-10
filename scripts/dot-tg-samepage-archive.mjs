// Архив УСТАРЕВШЕЙ копии одного TG-поста, созданной ДО правки поста в канале.
// Кейс (разобран 10.10.2026, запуск 151): пост t.me/nyachang_ru/24330 создан 2026-10-08T08:20:23Z,
// сначала текст был «💃 Танцевальное занятие», позже автор отредактировал пост на
// «Групповое занятие по бачате с нуля…». Сборщик TG снял его дважды: 8985913a (08.10, старое
// название) и 0024836e (09.10, актуальный текст). Обе карточки ЖИВЫЕ, но пост ОДИН, у них один
// website, одна дата/время (13.10 12:00), один пин и один контакт — событие одно.
// Оставляем карточку, совпадающую с ТЕКУЩИМ текстом поста (0024836e), устаревшую 8985913a — в архив.
// Запуск: node --env-file=.env scripts/dot-tg-samepage-archive.mjs            (сухой)
//         APPLY=1 node --env-file=.env scripts/dot-tg-samepage-archive.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// keep -> drop + обоснование (проверено чтением базы и самого поста 10.10.2026)
const PLAN = [
  {
    keep: '0024836e',
    drop: '8985913a',
    page: 'https://t.me/nyachang_ru/24330',
    // фрагмент, который обязан быть в заголовке оставляемой карточки (текущий текст поста)
    keepToken: 'бачат',
    why: 'один и тот же пост t.me/nyachang_ru/24330; текст поста отредактирован на «Групповое занятие по бачате», карточка 8985913a — снимок до правки (другого события в посте нет)',
  },
];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,start_date,start_time,website,lat,lng,address,contact_telegram');
const byPrefix = (p) => rows.find((r) => String(r.id).startsWith(p));

console.log('режим:', APPLY ? 'APPLY' : 'dry');
console.log('строк прочитано:', rows.length);
let done = 0, err = 0;
for (const step of PLAN) {
  const keep = byPrefix(step.keep), drop = byPrefix(step.drop);
  if (!keep || !drop) { console.log(`  ${step.drop}: не найдено (keep=${!!keep} drop=${!!drop})`); err++; continue; }

  const samePage = String(drop.website || '').split('#')[0] === String(keep.website || '').split('#')[0]
    && String(keep.website || '').startsWith(step.page);
  const keepHasToken = [keep.title, keep.title_ru].some((t) => String(t || '').toLowerCase().includes(step.keepToken));
  const dropLacksToken = ![drop.title, drop.title_ru].some((t) => String(t || '').toLowerCase().includes(step.keepToken));
  const sameWhen = String(drop.start_date) === String(keep.start_date) && String(drop.start_time) === String(keep.start_time);
  const near = Math.abs(Number(drop.lat) - Number(keep.lat)) < 0.0015 && Math.abs(Number(drop.lng) - Number(keep.lng)) < 0.0015;
  const alive = keep.status === 'active' && drop.status === 'active';
  const guard = samePage && keepHasToken && dropLacksToken && sameWhen && near && alive;

  console.log(`  ${step.drop} [${drop.status}] ${drop.start_date} ${drop.start_time} ${drop.city} | «${drop.title}»`);
  console.log(`    keep ${step.keep} [${keep.status}] «${keep.title}» | ${keep.lat},${keep.lng} vs ${drop.lat},${drop.lng}`);
  console.log(`    страховки: одна страница ${samePage} | keep содержит «${step.keepToken}» ${keepHasToken} | drop без него ${dropLacksToken} | одна дата/время ${sameWhen} | пин ${near} | обе живые ${alive}`);
  if (!guard) { console.log('    ПРОПУСК: страховка не пройдена'); continue; }

  if (!APPLY) { console.log('    dry: ушла бы в archived'); continue; }
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', drop.id).select('id,status');
  if (error || !data?.length) { console.log('    ОШИБКА:', error?.message || 'обновлено 0 строк'); err++; continue; }
  console.log('    archived OK:', step.drop, data[0].status);
  done++;
}
console.log(APPLY ? `архивировано ${done}, ошибок ${err}` : `dry: кандидатов ${PLAN.length}`);
