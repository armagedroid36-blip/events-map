// Зонд: живые карточки БЕЗ времени начала (start_time NULL или 00:00).
// Норма известна по источникам (проверено 20.10.2026, запуск 362):
//   baliforum.ru  — запись ленты отдаёт startAt == endAt (23:59 «время не указано») => null законен, 83 карточки;
//   cyprusnow.app — у записи в ленте start_at = полночь местного (событие «весь день»), дата совпадает => 00:00 законен, 31;
//   прочие (регаты/марафоны/фестивали/регулярные шоу) — источник времени начала не публикует, 12.
// Дефект = карточка, чей ХОСТ не входит в известный список (новый источник начал отдавать пустое время)
// либо появился новый класс. Печатает по хостам и список «незнакомых» карточек.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// хосты, у которых отсутствие времени — проверенная норма источника
const KNOWN = ['baliforum.ru', 'cyprusnow.app', 't.me', 'regattaofchampions.com', 'arena-sports.com',
  'dotheatre.vn', 'danang365.com', 'facebook.com', 'cyprus.bz', 'famagustatc.com', 'ubudcenter.com'];

const rows = await selectAll(db, 'events', 'id,status,city,start_date,start_time,title,title_ru,website,recurrence');
const live = rows.filter(r => r.status === 'active' || r.status === 'moderation');
const noTime = live.filter(r => !r.start_time || String(r.start_time).startsWith('00:00'));

const host = r => { try { return new URL(r.website).hostname.replace(/^www\./, ''); } catch { return 'нет сайта'; } };
const byHost = new Map();
for (const r of noTime) { const h = host(r); byHost.set(h, (byHost.get(h) || 0) + 1); }

console.log(`живых: ${live.length}; без времени: ${noTime.length}`);
for (const [h, n] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${KNOWN.includes(h) ? ' ' : '!'} ${h}: ${n}`);
}
const unknown = noTime.filter(r => !KNOWN.includes(host(r)));
console.log(`--- незнакомые хосты (проверить источником): ${unknown.length}`);
for (const r of unknown) {
  console.log(`${r.id.slice(0, 8)} | ${r.status} | ${r.city} | ${r.start_date} | ${(r.title_ru || r.title || '').slice(0, 45)} | ${r.website}`);
}
const noSite = noTime.filter(r => host(r) === 'нет сайта');
console.log(`--- без сайта (проверять нечем): ${noSite.length}`);
console.log(unknown.length ? 'ИТОГ: есть карточки вне известных источников' : 'НОРМА — все пустые времена объяснены источниками');
