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
// Запуск: node scripts/moderate-events.mjs [--dry-run] [--limit=100] [--no-llm]
// Переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE, DEEPSEEK_API_KEY,
//             MODERATION_MAX_LLM (по умолчанию 100), MODERATION_RECHECK_HOURS (24),
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
const argLimit = args.find((a) => a.startsWith('--limit='));
const LIMIT = Math.max(1, Math.min(500, Number(argLimit ? argLimit.split('=')[1] : 100) || 100));
const MAX_LLM = Math.max(1, Number(process.env.MODERATION_MAX_LLM || 100) || 100);
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

/** Решение по одной карточке: правила + (при необходимости) LLM */
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
  const changed = updatedAt > prevAt;
  const stale = !prevAt || Date.now() - prevAt > RECHECK_HOURS * 3600 * 1000;

  if (prev && !changed && !stale) {
    return {
      verdict: prev.verdict,
      flags: Array.isArray(prev.flags) ? prev.flags : [],
      reason: prev.reason || '',
      engine: 'cached',
    };
  }
  if (NO_LLM || budget.used >= budget.max || budget.down) {
    const reason = budget.down
      ? 'LLM-проверка недоступна (серия отказов, карточка отложена)'
      : 'LLM-проверка недоступна';
    return { verdict: 'review', flags: [...rules.flags, 'unchecked'], reason, engine: 'rules' };
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

async function main() {
  if (!(await autoPublishEnabled())) {
    console.log('Автопубликация выключена в настройках админки — проверка не запускается.');
    return;
  }

  const { count, error: ce } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'moderation')
    .in('source_type', ['collector', 'theatre']);
  if (ce) throw new Error(ce.message);

  if (!count) {
    console.log('Проверять нечего: очередь модерации сборщика пуста.');
    return;
  }

  const { data: events, error } = await db
    .from('events')
    .select(COLUMNS)
    .eq('status', 'moderation')
    .in('source_type', ['collector', 'theatre'])
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  if (error) throw new Error(error.message);

  const queue = events || [];
  console.log(`Проверяю: ${queue.length} из ${count} в очереди${DRY_RUN ? ' (тестовый прогон, без записи)' : ''}`);

  const budget = { used: 0, max: MAX_LLM, fails: 0, down: false, errors: [] };
  const totals = { publish: 0, review: 0, reject: 0, failed: 0 };
  const items = [];

  for (const ev of queue) {
    const title = String(ev.title_ru || ev.title_en || ev.title || 'Без названия').slice(0, 60);
    let decision;
    try {
      decision = await decide(ev, budget);
    } catch (e) {
      totals.failed++;
      console.error(`  ! ${title}: ошибка проверки — ${e.message}`);
      continue;
    }

    const review = {
      verdict: decision.verdict,
      flags: decision.flags || [],
      reason: decision.reason || '',
      engine: decision.engine || 'rules',
      at: new Date().toISOString(),
    };

    const status = decision.verdict === 'publish' ? 'active' : decision.verdict === 'reject' ? 'rejected' : 'moderation';
    totals[decision.verdict === 'publish' ? 'publish' : decision.verdict === 'reject' ? 'reject' : 'review']++;

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

  const report = {
    checked_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    queue: count,
    checked: queue.length,
    llm_calls: budget.used,
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
    `Готово: опубликовано ${totals.publish}, на проверку ${totals.review}, ` +
      `отклонено ${totals.reject}, ошибок ${totals.failed} (LLM-вызовов ${budget.used}` +
      `${budget.errors.length ? `, отказов LLM ${budget.errors.length}` : ''})`,
  );
  if (budget.down) {
    console.log(`LLM не отвечал — проверка прервана досрочно, причины: ${[...new Set(budget.errors)].join('; ')}`);
  }
  if (count > queue.length) console.log(`В очереди ещё ${count - queue.length} — обработаются в следующий запуск.`);
}

main().catch((e) => {
  console.error('Ошибка автопроверки:', e.message);
  process.exit(1);
});
