#!/usr/bin/env node
/**
 * Разбор застрявших карточек статуса `needs_changes`.
 *
 * Класс: автопроверка ставит карточке вердикт `review` (спорное) — она остаётся в
 * очереди `needs_changes` и НИКОГДА не публикуется и не архивируется сама. Если причина
 * «review» — пустое описание и непонятный тип, лечение одно: добрать описание/время со
 * страницы ИСТОЧНИКА (или второго арбитра) и вернуть карточку в `moderation` — тогда
 * штатный `moderate-events.mjs` пересмотрит её (кэш судьи опирается на `updated_at`,
 * правка карточки сбрасывает кэш) и опубликует.
 *
 * Страховки: карточка найдена ровно одна, её статус = `needs_changes`, источник
 * `collector`/`theatre`, дата начала совпадает с ожидаемой, а старый `start_time`
 * совпадает с ожидаемым, если он указан. Ничего, кроме `description`/`description_en`
 * (и, при необходимости, `start_time`) не меняем; `address` и `city` не трогаем —
 * они входят в ключ дедупа.
 *
 * Запуск: node scripts/dot-needs-changes-fill.mjs         (DRY, печатает план)
 *         node scripts/dot-needs-changes-fill.mjs --apply (применяет)
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const APPLY = process.argv.includes('--apply');

/** Арбитры и правки — каждая запись проверена вручную, цитаты в `why`. */
const ENTRIES = [
  {
    id: 'de2a0772-b6ff-4bab-91a9-e551bbd67f4d',
    titleLike: 'Φοιτητής 2026',
    expectStart: '2026-10-15',
    expectOldTime: '00:00:00',
    newStartTime: '15:00:00',
    description:
      'Student 2026 (Φοιτητής 2026) — a family festival at Columbia Plaza in Limassol on Thursday, '
      + '15 October 2026, starting at 15:00. Suitable for all ages.',
    why:
      'время 15:00 подтверждают два независимых арбитра: lima.events («Φοιτητής 2026 | Student 2026 | '
      + 'Limassol — Oct 15, 15:00 — Columbia Plaza») и HappeningNext/Fun Limassol («Thu, 15 Oct at 03:00 pm, '
      + 'Columbia Plaza, Ages 0–All»); тип у Fun Limassol — Festival',
  },
  {
    id: '5d80f2a2-1622-43ad-8ec3-ecb5454f31a3',
    titleLike: 'Ευτζιές',
    expectStart: '2026-10-23',
    newStartTime: null,
    description:
      'Theatre & Comedy performance in Greek at the «Αμμόχωστος» Cultural Centre '
      + '(ΠΟΛΙΤΙΣΤΙΚΟ ΚΕΝΤΡΟ «ΑΜΜΟΧΩΣΤΟΣ»), Famagusta district, on Friday 23 October 2026 at 19:30. '
      + 'Organised by Larnaca Municipality (Δήμος Λάρνακας).',
    why:
      'страница записи источника (cyprusnow.app, читается через прокси 10809) даёт тип «Theatre & Comedy», '
      + 'организатора «Δήμος Λάρνακας», язык «Greek», дату/время «Friday, 23 October 2026 at 19:30» и место '
      + '«ΠΟΛΙΤΙΣΤΙΚΟ ΚΕΝΤΡΟ «ΑΜΜΟΧΩΣΤΟΣ», Famagusta»; JSON-LD подтверждает startDate 2026-10-23T19:30:00+03:00',
  },
  {
    id: '89a8599f-c26e-4e99-b407-f69f8ffed2ce',
    titleLike: 'Dolphinarium Show',
    expectStart: '2026-09-22',
    expectOldTime: '10:00:00',
    newStartTime: null,
    lat: 15.9465129,
    lng: 108.2959303,
    description:
      'Family dolphinarium show at «Thiên Đường Cổ Cò» (Da Nang Dolphinarium, phường Điện Bàn Đông, '
      + 'Đà Nẵng) — 35–40 minutes of trained dolphins and seals: jumps through rings, balancing, '
      + 'interaction with trainers, plus a free visit to the Jurassic dinosaur park. '
      + 'Performances daily, approx. 10:00 and 15:00; tickets about 350,000 VND.',
    why:
      'у карточки не было координат (вывод судьи «нет координат»); источник danang365.com адреса площадки не даёт, '
      + 'только название «Khu biểu diễn cá heo Đà Nẵng». Арбитры: (1) билетные страницы дают адрес использования '
      + '«Da Nang Dolphinarium, phường Điện Bàn Đông, Thành phố Đà Nẵng» (danago.com.vn, danaticket.com); '
      + '(2) danago.com.vn и eholiday.vn называют площадку «Thiên Đường Cổ Cò» (Cổ Cò Paradise) — там идёт шоу '
      + '«Vũ điệu đại dương» (14:00/15:00 и 19:00/20:00, кроме вторника); (3) карт-ссылка с билетной страницы '
      + 'tixgo.vn (maps.app.goo.gl/xiCFymMwL1XxHAZ16) резолвится в плейс Google Maps «Thiên Đường Cổ Cò» '
      + '15.9465129,108.2959303. Адрес карточки НЕ трогаю — он входит в ключ дедупа.',
  },
];

const FIELDS = 'id,title,status,source_type,start_date,start_time,description,description_en,address,city,website,lat,lng';

async function main() {
  console.log(`Режим: ${APPLY ? 'APPLY' : 'DRY'}`);
  let applied = 0, skipped = 0, errors = 0;

  for (const e of ENTRIES) {
    const { data, error } = await db.from('events').select(FIELDS).ilike('title', `%${e.titleLike}%`);
    if (error) { console.log(`[${e.titleLike}] ошибка чтения: ${error.message}`); errors++; continue; }
    const rows = (data || []).filter((r) => r.id === e.id);
    if (rows.length !== 1) { console.log(`[${e.titleLike}] не найдена ровно одна карточка (${rows.length}) — пропуск`); skipped++; continue; }
    const ev = rows[0];

    if (ev.status !== 'needs_changes') { console.log(`[${e.id.slice(0, 8)}] пропуск: статус ${ev.status}, а не needs_changes`); skipped++; continue; }
    if (!['collector', 'theatre'].includes(ev.source_type)) { console.log(`[${e.id.slice(0, 8)}] пропуск: source_type ${ev.source_type}`); skipped++; continue; }
    if (ev.start_date !== e.expectStart) { console.log(`[${e.id.slice(0, 8)}] пропуск: дата ${ev.start_date}, ожидалась ${e.expectStart}`); skipped++; continue; }
    if (e.expectOldTime && (ev.start_time || '').slice(0, 8) !== e.expectOldTime) {
      console.log(`[${e.id.slice(0, 8)}] пропуск: start_time ${ev.start_time}, ожидалось ${e.expectOldTime}`); skipped++; continue;
    }
    if (e.lat != null && ev.lat != null) {
      console.log(`[${e.id.slice(0, 8)}] пропуск: координаты уже стоят (${ev.lat},${ev.lng}) — не перезаписываю`); skipped++; continue;
    }

    const patch = { description: e.description, status: 'moderation' };
    if (e.newStartTime) patch.start_time = e.newStartTime;
    if (e.lat != null) { patch.lat = e.lat; patch.lng = e.lng; }

    console.log(`[${e.id.slice(0, 8)}] ${ev.title.slice(0, 60)} | ${ev.city} | ${ev.start_date} `
      + `${ev.start_time ? String(ev.start_time).slice(0, 5) : '—'}${e.newStartTime ? ' -> ' + e.newStartTime.slice(0, 5) : ''}`);
    console.log(`   update: status -> moderation${e.newStartTime ? ', start_time' : ''}`
      + `${e.lat != null ? `, lat/lng -> ${e.lat},${e.lng}` : ''}, description (${e.description.length} симв.)`);
    console.log(`   почему: ${e.why}`);

    if (!APPLY) continue;
    const { data: upd, error: err } = await db.from('events')
      .update(patch).eq('id', e.id).eq('status', 'needs_changes').select('id,status,start_time,description');
    if (err) { console.log(`   ОШИБКА: ${err.message}`); errors++; continue; }
    if (!upd || upd.length !== 1) { console.log('   ОШИБКА: обновление не затронуло строку'); errors++; continue; }
    applied++;
  }

  console.log(`Итог: применено ${applied}, пропущено ${skipped}, ошибок ${errors}`);

  // контроль чтением
  const ids = ENTRIES.map((e) => e.id);
  const { data: after } = await db.from('events').select(FIELDS).in('id', ids);
  for (const r of after || []) {
    console.log(`КОНТРОЛЬ ${r.id.slice(0, 8)} [${r.status}] ${r.start_date} ${r.start_time ? String(r.start_time).slice(0, 5) : '—'} `
      + `| пин ${r.lat != null ? r.lat + ',' + r.lng : 'НЕТ'} `
      + `| описание ${r.description ? r.description.length + ' симв.' : 'ПУСТОЕ'} | city/адрес не тронуты: ${r.city} / ${r.address}`);
  }
}

main().catch((e) => { console.error('ПАДЕНИЕ:', e.message); process.exit(1); });
