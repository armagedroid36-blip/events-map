// Разовая (идемпотентная) дедупликация карточек событий.
//
// Дубли появились из-за дефекта existingKeys(): PostgREST отдаёт максимум 1000
// строк, поэтому ключи части событий не загружались и сборщики вставляли те же
// события повторно (у каждой копии свой URL /event/<uuid>/, одинаковые
// title/h1/description и self-canonical — прямой вред для SEO).
//
// Что делает: среди статусов active/moderation/needs_changes находит группы
// карточек одного и того же события и оставляет в группе ОДНУ запись —
// с минимальным created_at (первую, которую уже могли проиндексировать),
// при равенстве — более заполненную. Остальные переводятся в status='archived';
// физически ничего не удаляется.
//
// Признаки одного и того же события (объединяем, если совпал любой):
//  1) title + start_date + city;
//  2) title + start_date + место (координаты ближе 1 км) — ловит расхождение
//     города у одного и того же места («Чемаги, Bali» vs «Табанан, Bali»);
//  3) title + city + start_time + пересечение дат — ловит связку «серия
//     (recurrence) + одиночный анонс того же занятия»;
// где title сравнивается и по RU, и по EN варианту (EN-перевод машинный, у
// разных копий одного события он совпадает).
//
// Запуск:
//   DRY_RUN=1 node scripts/dedupe-events.mjs   — только отчёт, без записи
//   node scripts/dedupe-events.mjs             — заархивировать дубли
//
// Переменные окружения: SUPABASE_URL (или VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js';
import { selectAll, countRows } from './db-rows.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const DRY_RUN = process.env.DRY_RUN === '1';
const STATUSES = ['active', 'moderation', 'needs_changes'];
const CHUNK = 50;        // сколько id отправляем в одном update (длина URL у PostgREST ограничена)
const NEAR_M = 1000;     // «то же место» — координаты ближе 1 км
const HORIZON_DAYS = 120; // на сколько вперёд разворачиваем расписание регулярных событий

const COLUMNS = [
  'id', 'title', 'title_ru', 'title_en', 'city', 'website', 'status', 'created_at',
  'start_date', 'start_time', 'end_time', 'end_date', 'recurrence', 'address', 'lat', 'lng',
  'photos', 'price', 'currency', 'contact', 'category_id', 'source_type', 'description_en',
].join(',');

const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Все варианты названия карточки (RU и EN): у копий одного события совпадает хоть один */
function titleAliases(e) {
  const out = new Set();
  for (const t of [e.title_ru, e.title, e.title_en]) {
    const n = norm(t);
    if (n) out.add(n);
  }
  return [...out];
}

function hasCoords(e) {
  return typeof e.lat === 'number' && typeof e.lng === 'number';
}

/** Расстояние между координатами в метрах */
function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Даты вхождений карточки: одиночная — своя дата; регулярная — до end_date или горизонта */
function occurrences(e) {
  const out = [];
  if (!e.start_date) return out;
  out.push(e.start_date);
  const rec = e.recurrence;
  if (!rec || !rec.freq || !rec.days?.length && rec.freq !== 'daily') return out;

  const horizon = new Date(Date.now() + HORIZON_DAYS * 86400000);
  const stop = e.end_date ? new Date(`${e.end_date}T00:00:00Z`) : horizon;
  const limit = stop < horizon ? stop : horizon;
  const cursor = new Date(`${e.start_date}T00:00:00Z`);
  const days = rec.days || [];
  const iso = (d) => d.toISOString().slice(0, 10);
  for (let i = 0; i < 400 && cursor <= limit; i++) {
    const dow = cursor.getUTCDay() || 7; // 1=Пн..7=Вс
    const hits = rec.freq === 'daily' || (rec.freq === 'weekly' && (!days.length || days.includes(dow)));
    if (hits && iso(cursor) !== e.start_date) out.push(iso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Заполненность карточки — чем больше значимых полей, тем ценнее запись */
const FILLED_FIELDS = [
  'start_time', 'end_date', 'address', 'lat', 'lng', 'photos', 'price', 'contact',
  'title_en', 'description_en', 'source_type', 'recurrence',
];

function filledScore(e) {
  let n = 0;
  for (const f of FILLED_FIELDS) {
    const v = e[f];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    n++;
  }
  return n;
}

/** Какая запись остаётся: минимальный created_at, при равенстве — более заполненная, затем id */
function pickKeeper(rows) {
  return [...rows].sort((a, b) => {
    const ca = a.created_at || '';
    const cb = b.created_at || '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    const sa = filledScore(a);
    const sb = filledScore(b);
    if (sa !== sb) return sb - sa;
    return String(a.id) < String(b.id) ? -1 : 1;
  })[0];
}

// ===== Объединение карточек в группы (union-find) =====

function makeUnionFind(rows) {
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const rules = new Map(); // id → Set правил, по которым карточка вошла в группу
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const union = (a, b, rule) => {
    const ra = find(a.id);
    const rb = find(b.id);
    if (ra === rb) return false;
    parent.set(rb, ra);
    for (const id of [a.id, b.id]) {
      if (!rules.has(id)) rules.set(id, new Set());
      rules.get(id).add(rule);
    }
    return true;
  };
  return { find, union, rules };
}

function buildGroups(rows) {
  const { find, union, rules } = makeUnionFind(rows);

  // 1) title + дата + город
  const byTitleDateCity = new Map();
  // 2) title + дата (склейка по месту)
  const byTitleDate = new Map();
  // 3) title + город + время (склейка по перекрытию расписаний)
  const byTitleCityTime = new Map();
  const push = (map, key, row) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  };

  for (const e of rows) {
    for (const alias of titleAliases(e)) {
      push(byTitleDateCity, `${alias}|${e.start_date || ''}|${norm(e.city)}`, e);
      push(byTitleDate, `${alias}|${e.start_date || ''}`, e);
      push(byTitleCityTime, `${alias}|${norm(e.city)}|${e.start_time || ''}`, e);
    }
  }

  for (const list of byTitleDateCity.values()) {
    for (let i = 1; i < list.length; i++) union(list[0], list[i], 'title+дата+город');
  }

  const coordsEdges = [];
  for (const list of byTitleDate.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!hasCoords(a) || !hasCoords(b)) continue;
        const d = distanceM(a, b);
        if (d <= NEAR_M && union(a, b, 'title+дата+то же место')) {
          coordsEdges.push({ a, b, d: Math.round(d) });
        }
      }
    }
  }

  const seriesEdges = [];
  for (const list of byTitleCityTime.values()) {
    if (list.length < 2) continue;
    const dates = list.map((e) => new Set(occurrences(e)));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (find(list[i].id) === find(list[j].id)) continue;
        const overlap = [...dates[i]].filter((d) => dates[j].has(d));
        if (!overlap.length) continue;
        if (union(list[i], list[j], 'перекрытие расписания')) {
          seriesEdges.push({ a: list[i], b: list[j], overlap: overlap.slice(0, 3) });
        }
      }
    }
  }

  const groups = new Map();
  for (const e of rows) {
    const root = find(e.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(e);
  }
  return { groups: [...groups.values()].filter((g) => g.length > 1), rules, coordsEdges, seriesEdges };
}

async function archive(ids) {
  let archived = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    if (DRY_RUN) {
      archived += part.length;
      continue;
    }
    const { error } = await db.from('events').update({ status: 'archived' }).in('id', part);
    if (error) {
      console.error(`  Ошибка архивации (${part.length} шт.): ${error.message}`);
      continue;
    }
    archived += part.length;
  }
  return archived;
}

/** Поля, которые переносим из дубля в оставленную карточку, если у неё они пустые */
const ENRICH_FIELDS = [
  'start_time', 'end_time', 'address', 'photos', 'price', 'currency', 'contact',
  'title_en', 'description_en', 'category_id',
];

const isBlank = (v) =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

/**
 * Подтянуть в оставленную карточку данные из архивных копий (только в пустые поля).
 * Без этого дедуп мог бы «уронить» цену/фото, которые были только у копии.
 */
async function enrich(keeper, rest) {
  const patch = {};
  for (const f of ENRICH_FIELDS) {
    if (!isBlank(keeper[f])) continue;
    for (const dup of rest) {
      if (dup[f] === undefined || isBlank(dup[f])) continue;
      patch[f] = dup[f];
      break;
    }
  }
  // Координаты переносим парой
  if (isBlank(keeper.lat) && isBlank(keeper.lng)) {
    const withCoords = rest.find((d) => !isBlank(d.lat) && !isBlank(d.lng));
    if (withCoords) {
      patch.lat = withCoords.lat;
      patch.lng = withCoords.lng;
    }
  }
  if (!Object.keys(patch).length) return null;
  if (DRY_RUN) return patch;
  const { error } = await db.from('events').update(patch).eq('id', keeper.id);
  if (error) {
    console.error(`  Ошибка дозаполнения оставленной карточки ${keeper.id.slice(0, 8)}: ${error.message}`);
    return null;
  }
  return patch;
}

function short(e) {
  return `${e.id.slice(0, 8)} [${e.status}] ${e.start_date} ${e.start_time || '--:--'} «${String(e.title).slice(0, 45)}» ${e.city || '—'}`;
}

async function main() {
  const total = await countRows(db, 'events');
  const rows = await selectAll(db, 'events', COLUMNS, {
    filter: (q) => q.in('status', STATUSES),
    log: (m) => console.log(`  ${m}`),
  });
  const byStatus = {};
  for (const e of rows) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  console.log(`Строк в events: ${total}. Карточек в статусах ${STATUSES.join('/')}: ${rows.length}${DRY_RUN ? ' (DRY_RUN: только отчёт)' : ''}`);
  console.log(`Статусы: ${STATUSES.map((s) => `${s}=${byStatus[s] || 0}`).join(', ')}`);

  const { groups, rules, coordsEdges, seriesEdges } = buildGroups(rows);

  const idsToArchive = [];
  const extraGroups = [];
  const enriched = [];
  let archivedFrom = {};
  for (const g of groups) {
    const keeper = pickKeeper(g);
    const rest = g.filter((e) => e.id !== keeper.id);
    const patch = await enrich(keeper, rest);
    if (patch) enriched.push({ id: keeper.id, title: keeper.title, fields: Object.keys(patch) });
    idsToArchive.push(...rest.map((e) => e.id));
    for (const e of rest) archivedFrom[e.status] = (archivedFrom[e.status] || 0) + 1;
    const usedRules = new Set();
    for (const e of g) for (const r of rules.get(e.id) || []) usedRules.add(r);
    if ([...usedRules].some((r) => r !== 'title+дата+город')) {
      extraGroups.push({ g, keeper, rest, usedRules: [...usedRules] });
    }
  }

  console.log('');
  console.log(`Групп дублей: ${groups.length} (записей в них ${groups.reduce((n, g) => n + g.length, 0)})`);
  console.log(`  из них склеено по месту (координаты): ${coordsEdges.length} связок`);
  console.log(`  из них склеено по перекрытию расписания: ${seriesEdges.length} связок`);
  for (const e of coordsEdges) console.log(`    место ~${e.d} м: ${short(e.a)} ↔ ${short(e.b)}`);
  for (const e of seriesEdges) console.log(`    расписание ${e.overlap.join(',')}: ${short(e.a)} ↔ ${short(e.b)}`);

  const archived = await archive(idsToArchive);
  console.log('');
  console.log(`${DRY_RUN ? 'Будет заархивировано' : 'Заархивировано'} записей: ${archived} (${Object.entries(archivedFrom).map(([s, n]) => `${s}=${n}`).join(', ') || '—'})`);
  if (enriched.length) {
    console.log(`${DRY_RUN ? 'Будет дозаполнено' : 'Дозаполнено'} оставленных карточек: ${enriched.length}`);
    for (const e of enriched) console.log(`    ${e.id.slice(0, 8)} «${String(e.title).slice(0, 40)}» ← ${e.fields.join(', ')}`);
  }

  const examples = groups.slice().sort((a, b) => b.length - a.length).slice(0, 5);
  if (examples.length) {
    console.log('');
    console.log('Примеры групп:');
    for (const g of examples) {
      const keeper = pickKeeper(g);
      console.log(`  «${String(keeper.title).slice(0, 50)}» ${keeper.start_date} ${keeper.city || '—'}`);
      for (const r of g) {
        console.log(`    ${r.id === keeper.id ? 'ОСТАВЛЕН ' : 'архив    '} ${short(r)} создано ${r.created_at} заполнено=${filledScore(r)}`);
      }
    }
  }

  if (extraGroups.length) {
    console.log('');
    console.log('Группы, найденные не по «title+дата+город» (проверить глазами):');
    for (const { g, keeper, rest } of extraGroups) {
      console.log(`  «${String(keeper.title).slice(0, 50)}» ${keeper.start_date}:`);
      for (const r of g) console.log(`    ${r.id === keeper.id ? 'ОСТАВЛЕН ' : 'архив    '} ${short(r)} website=${r.website || '—'}`);
      if (rest.length) console.log(`    (будет архивировано ${rest.length})`);
    }
  }

  if (!DRY_RUN) {
    const after = await selectAll(db, 'events', 'id,title,title_en,start_date,city,status,created_at,start_time,recurrence,end_date,lat,lng', {
      filter: (q) => q.in('status', STATUSES),
    });
    const { groups: leftGroups } = buildGroups(after);
    const byStatusAfter = {};
    for (const e of after) byStatusAfter[e.status] = (byStatusAfter[e.status] || 0) + 1;
    console.log('');
    console.log(`Контроль: карточек в ${STATUSES.join('/')} — ${after.length} (${STATUSES.map((s) => `${s}=${byStatusAfter[s] || 0}`).join(', ')})`);
    console.log(`Контроль: групп дублей осталось — ${leftGroups.length}`);
  }
}

main().catch((e) => {
  console.error('Ошибка дедупликации:', e.message);
  process.exit(1);
});
