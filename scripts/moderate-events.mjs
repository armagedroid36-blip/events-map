// Автопроверка собранных событий перед публикацией.
//
// Что делает: берёт события сборщиков, которые лежат на модерации
// (source_type = collector / theatre), проверяет их правилами (мат,
// запрещённые темы, обязательные поля — moderation-rules.mjs) и LLM-судьёй
// (moderation-llm.mjs), после чего:
//   publish → status = 'active'  (карточка сразу на сайте)
//   review  → остаётся в 'moderation' (человек смотрит в админке)
//   reject  → status = 'rejected' (мат, криминал, аморальное; причина видна админу)
//
// Заявки организаторов (source_type = 'organizer') не трогает — они как раньше
// ждут ручной модерации.
//
// Очередь разбирается ПАКЕТАМИ до её исчерпания: за один прогон проверяются ВСЕ
// карточки, накопившиеся с прошлого запуска, а не первые сто. Пагинация — по
// (created_at, id): следующий пакет берётся строго «после» последней разобранной
// карточки, поэтому ни одна не проверяется дважды и ни одна не теряется.
//
// Предохранители — чтобы прогон не тянулся часами и не упёрся в лимит GitHub
// Actions: MODERATION_MAX_LLM (по умолчанию 100) — сколько вызовов модели
// разрешено за прогон, MODERATION_MAX_MINUTES (40) — бюджет времени. Как только
// любой из них исчерпан, прогон останавливается, а неразобранный хвост остаётся в
// очереди следующему запуску (в логе есть строка «осталось в очереди K»).
//
// Запуск: node scripts/moderate-events.mjs [--dry-run] [--limit=100] [--batch=100] [--no-llm]
//   --limit=N / --batch=N — размер пакета (по умолчанию 100, максимум 500)
// Переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE, DEEPSEEK_API_KEY,
//             MODERATION_MAX_LLM (100) — общий лимит вызовов LLM за прогон,
//             MODERATION_MAX_MINUTES (40) — бюджет времени прогона,
//             MODERATION_RECHECK_HOURS (24), MODERATION_LLM_FAIL_LIMIT (3),
//             MODERATION_REPORT (путь к JSON-отчёту, по умолчанию ./auto-moderation-report.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { checkRules, eventTextForLlm } from './moderation-rules.mjs';
import { judgeEventWithReason } from './moderation-llm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// Локальный запуск: подтянуть .env из корня проекта, если переменных нет
// (в GitHub Actions секреты приходят через env — файла нет).
function loadDotEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE) return;
  const envPath = path.join(here, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_LLM = args.includes('--no-llm') || !process.env.DEEPSEEK_API_KEY;
// --limit/--batch задают ТОЛЬКО размер пакета: сколько карточек брать одним
// запросом. Общий объём прогона ограничивают предохранители ниже.
const argBatch = args.find((a) => a.startsWith('--limit=') || a.startsWith('--batch='));
const BATCH = Math.max(1, Math.min(500, Number(argBatch ? argBatch.split('=')[1] : 100) || 100));
const MAX_LLM = Math.max(1, Number(process.env.MODERATION_MAX_LLM || 100) || 100);
const MAX_MINUTES = Math.max(1, Number(process.env.MODERATION_MAX_MINUTES || 40) || 40);
const STARTED_AT = Date.now();
const TIME_BUDGET_MS = MAX_MINUTES * 60 * 1000;
// Сколько отказов LLM подряд считаем «модель легла»: дальше карточки идут
// человеку без вызова API (иначе серия таймаутов растянет прогон на часы).
const LLM_FAIL_LIMIT = Math.max(1, Number(process.env.MODERATION_LLM_FAIL_LIMIT || 3) || 3);
const RECHECK_HOURS = Math.max(1, Number(process.env.MODERATION_RECHECK_HOURS || 24) || 24);
const REPORT_PATH = process.env.MODERATION_REPORT || path.join(here, '..', 'auto-moderation-report.json');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const COLUMNS = [
  'id', 'title', 'title_ru', 'title_en', 'description', 'description_ru', 'description_en',
  'city', 'address', 'lat', 'lng', 'category_id', 'website', 'photos',
  'start_date', 'end_date', 'source_type', 'status', 'created_at', 'updated_at',
  'auto_review', 'auto_reviewed_at',
].join(', ');

/** Настройка автопубликации из app_settings ('on' | 'off') */
async function autoPublishEnabled() {
  const { data, error } = await db.from('app_settings').select('value').eq('key', 'auto_publish').maybeSingle();
  if (error) {
    console.warn(`Настройку auto_publish не прочитать (${error.message}) — считаю включённой`);
    return true;
  }
  return (data?.value ?? 'on') !== 'off';
}

/** Размер очереди модерации сборщика (карточек) */
async function queueCount() {
  const { count, error } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'moderation')
    .in('source_type', ['collector', 'theatre']);
  if (error) throw new Error(error.message);
  return count || 0;
}

/**
 * PostgREST отдаёт timestamptz как '2026-09-26T14:11:16.113829+00:00'. В фильтре
 * '+' превратился бы в пробел, а округление до миллисекунд («...113Z») сломало
 * бы сравнение с микросекундной точностью (одинаковые created_at у пакетной
 * вставки) — поэтому смещение меняем на 'Z', микросекунды сохраняем как есть.
 */
function isoForFilter(value) {
  const s = String(value);
  if (s.endsWith('Z')) return s;
  const zulu = s.replace(/\+00:00$/, 'Z');
  if (zulu !== s) return zulu;
  console.warn(`Неожиданный формат created_at (${s}) — сравниваю с точностью до миллисекунд`);
  return new Date(s).toISOString();
}

/**
 * Один пакет очереди строго «после» курсора: сортировка и сравнение по паре
 * (created_at, id), поэтому пакеты не пересекаются и прогон всегда движется вперёд.
 * @param {{created_at: string, id: string}|null} cursor последняя разобранная карточка
 */
async function fetchBatch(cursor) {
  let req = db
    .from('events')
    .select(COLUMNS)
    .eq('status', 'moderation')
    .in('source_type', ['collector', 'theatre'])
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(BATCH);
  if (cursor) {
    const ts = isoForFilter(cursor.created_at);
    req = req.or(`created_at.gt.${ts},and(created_at.eq.${ts},id.gt.${cursor.id})`);
  }
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Причина остановки прогона (предохранители) или null */
function guardTrip(budget) {
  if (Date.now() - STARTED_AT >= TIME_BUDGET_MS) return `бюджет времени прогона (${MAX_MINUTES} мин)`;
  if (budget.used >= budget.max) return `лимит LLM-вызовов за прогон (${budget.max})`;
  return null;
}

/**
 * Решение по одной карточке: правила + (при необходимости) LLM.
 * null — прогон остановлен предохранителем, карточку не трогаем (уйдёт следующему запуску).
 */
async function decide(ev, budget) {
  const rules = checkRules(ev);

  if (rules.verdict === 'reject') {
    return { verdict: 'reject', flags: rules.flags, reason: rules.reason, engine: 'rules' };
  }
  if (rules.verdict === 'review') {
    return { verdict: 'review', flags: rules.flags, reason: rules.reason, engine: 'rules' };
  }

  // Правила возражений не нашли — решает LLM. Если карточку уже проверяли
  // и с тех пор не меняли, повторно модель не дёргаем (экономия).
  const prev = ev.auto_review || null;
  const prevAt = ev.auto_reviewed_at ? Date.parse(ev.auto_reviewed_at) : 0;
  const updatedAt = ev.updated_at ? Date.parse(ev.updated_at) : 0;
  // Допуск на расхождение часов клиента и базы: время проверки пишет скрипт,
  // updated_at — триггер базы, поэтому разница в доли секунды не должна выглядеть
  // как «карточку изменили» (иначе кэш не работает и модель дёргается каждый прогон).
  const changed = updatedAt - prevAt > 2000;
  const stale = !prevAt || Date.now() - prevAt > RECHECK_HOURS * 3600 * 1000;

  if (prev && !changed && !stale) {
    return {
      verdict: prev.verdict,
      flags: Array.isArray(prev.flags) ? prev.flags : [],
      reason: prev.reason || '',
      engine: 'cached',
    };
  }
  if (NO_LLM || budget.down) {
    const reason = budget.down
      ? 'LLM-проверка недоступна (серия отказов, карточка отложена)'
      : 'LLM-проверка недоступна';
    return { verdict: 'review', flags: [...rules.flags, 'unchecked'], reason, engine: 'rules' };
  }

  // Предохранитель: лимит вызовов модели или времени исчерпан — остаток очереди
  // оставляем как есть (карточка даже не помечается, чтобы не выдавать
  // непроверенное за проверенное).
  const stop = guardTrip(budget);
  if (stop) {
    budget.stop = stop;
    return null;
  }

  budget.used++;
  const judged = await judgeEventWithReason(eventTextForLlm(ev));
  if (!judged.ok) {
    budget.fails++;
    budget.errors.push(judged.error);
    if (budget.fails >= LLM_FAIL_LIMIT && !budget.down) {
      budget.down = true;
      console.warn(
        `! LLM: ${budget.fails} отказов подряд (${judged.error}) — остальные карточки ` +
          'отправляются человеку без вызова модели',
      );
    }
    return {
      verdict: 'review',
      flags: [...rules.flags, 'unchecked'],
      reason: `LLM не ответил: ${judged.error}`.slice(0, 200),
      engine: 'rules',
    };
  }
  budget.fails = 0;

  const decision = { verdict: judged.verdict, flags: judged.flags, reason: judged.reason };
  // Противоречие «reject без конкретной причины» — отдаём человеку
  if (decision.verdict === 'reject' && decision.flags.every((f) => f === 'unclear')) {
    return { ...decision, verdict: 'review' };
  }
  return { ...decision, engine: 'rules+llm' };
}

const plural = (n, one, few, many) => {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
};

async function main() {
  if (!(await autoPublishEnabled())) {
    console.log('Автопубликация выключена в настройках админки — проверка не запускается.');
    return;
  }

  const queueStart = await queueCount();
  if (!queueStart) {
    console.log('Проверять нечего: очередь модерации сборщика пуста.');
    return;
  }

  console.log(
    `В очереди ${queueStart} ${plural(queueStart, 'карточка', 'карточки', 'карточек')}; ` +
      `пакет ${BATCH}, лимит LLM-вызовов ${MAX_LLM}, бюджет времени ${MAX_MINUTES} мин` +
      `${DRY_RUN ? ' (тестовый прогон, без записи)' : ''}`,
  );

  const budget = { used: 0, max: MAX_LLM, fails: 0, down: false, errors: [], stop: null };
  const totals = { publish: 0, review: 0, reject: 0, failed: 0 };
  const items = [];
  let cursor = null;
  let batches = 0;
  let checked = 0; // карточек, по которым решение принято (или запись сорвалась)

  let cursorUnchanged = false;
  while (true) {
    const batch = await fetchBatch(cursor);
    if (!batch.length) break;
    batches++;

    for (const ev of batch) {
      const title = String(ev.title_ru || ev.title_en || ev.title || 'Без названия').slice(0, 60);
      let decision;
      try {
        decision = await decide(ev, budget);
      } catch (e) {
        checked++;
        totals.failed++;
        console.error(`  ! ${title}: ошибка проверки — ${e.message}`);
        continue;
      }
      if (!decision) break; // предохранитель: остаток очереди — следующему запуску

      const review = {
        verdict: decision.verdict,
        flags: decision.flags || [],
        reason: decision.reason || '',
        engine: decision.engine || 'rules',
        at: new Date().toISOString(),
      };

      totals[decision.verdict === 'publish' ? 'publish' : decision.verdict === 'reject' ? 'reject' : 'review']++;
      checked++;

      const patch = { auto_review: review, auto_reviewed_at: review.at };
      if (decision.verdict === 'publish') {
        patch.status = 'active';
        console.log(`  → опубликовано: ${title}`);
      } else if (decision.verdict === 'reject') {
        patch.status = 'rejected';
        patch.reject_reason = `Автопроверка: ${decision.reason || 'не соответствует правилам сайта'}`;
        console.log(`  ✕ отклонено: ${title} — ${decision.reason}`);
      } else {
        console.log(`  … на проверку: ${title} — ${decision.reason}`);
      }

      items.push({ id: ev.id, title, source: ev.source_type, ...review });

      if (!DRY_RUN) {
        const { error: ue } = await db.from('events').update(patch).eq('id', ev.id);
        if (ue) {
          console.error(`    не удалось обновить: ${ue.message}`);
          totals.failed++;
        }
      }
    }

    if (budget.stop) break;

    const last = batch[batch.length - 1];
    const sameCursor = cursor && String(cursor.id) === String(last.id) && String(cursor.created_at) === String(last.created_at);
    cursor = { created_at: last.created_at, id: last.id };
    if (sameCursor) {
      // Страховка от зацикливания: курсор обязан двигаться вперёд.
      cursorUnchanged = true;
      console.warn('Пакет не сдвинул курсор — останавливаюсь, чтобы не зациклиться');
      break;
    }
    if (batch.length < BATCH) break; // очередь кончилась
  }

  const remaining = await queueCount();
  const tail = Math.max(0, queueStart - checked);
  const seconds = Math.round((Date.now() - STARTED_AT) / 1000);
  const duration = `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
  const unchecked = items.filter((i) => (i.flags || []).includes('unchecked')).length;

  const report = {
    checked_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    queue: queueStart,
    checked,
    batch_size: BATCH,
    batches,
    remaining,
    tail,
    stopped: budget.stop,
    duration_seconds: seconds,
    llm_calls: budget.used,
    llm_calls_max: budget.max,
    llm_failed: budget.errors.length,
    llm_stopped_early: budget.down,
    llm_errors: [...new Set(budget.errors)].slice(0, 5),
    totals,
    items,
  };
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1), 'utf8');
  } catch (e) {
    console.warn(`Отчёт не записан: ${e.message}`);
  }

  console.log(
    `Проверено ${checked}: опубликовано ${totals.publish}, на проверку ${totals.review}, ` +
      `отклонено ${totals.reject}, ошибок ${totals.failed}`,
  );
  console.log(
    `Готово: опубликовано ${totals.publish}, на проверку ${totals.review}, ` +
      `отклонено ${totals.reject}, осталось в очереди ${tail}` +
      ` (LLM-вызовов ${budget.used} из ${budget.max}, пакетов ${batches}, ${duration})`,
  );
  if (unchecked) console.log(`Из оставшихся человеку ${unchecked} без LLM-проверки (причина в карточке).`);
  if (budget.stop) {
    console.log(
      `Прогон остановлен: ${budget.stop} — остаток очереди (${tail}) разберёт следующий запуск.`,
    );
  }
  if (budget.down) {
    console.log(`LLM не отвечал — дальше карточки шли человеку без модели, причины: ${[...new Set(budget.errors)].join('; ')}`);
  }
  if (cursorUnchanged) console.log('Пагинация остановлена страховкой от зацикливания — проверь фильтр пакета.');
  console.log(`Очередь модерации сборщика после прогона: ${remaining}.`);
}

main().catch((e) => {
  console.error('Ошибка автопроверки:', e.message);
  process.exit(1);
});
