/**
 * Единый сторож «база закрыта по квоте» для скриптов сборки и сбора.
 *
 * Supabase на бесплатном тарифе при превышении egress отвечает HTTP 402
 * `{"message":"Service for this project is restricted ... exceed_egress_quota"}`.
 * Это не ошибка нашего кода: сборщику нечего чинить, и красный прогон
 * workflow только шумит. Скрипт должен написать одну понятную строку и
 * завершиться с кодом 0 — тогда расписание продолжает работать, а когда
 * квота восстановится, всё просто поедет дальше.
 *
 * Подключение — одной строкой в начале скрипта:
 *   import '../lib/quota.mjs';        // из scripts/*.mjs
 *   import './lib/quota.mjs';         // из scripts/<подпапка>/*.mjs
 *
 * Модуль:
 *  1) экспортирует isQuotaError / isQuotaText / quotaSkip;
 *  2) вешает обработчики unhandledRejection / uncaughtException — падение
 *     из-за квоты не валит прогон;
 *  3) перехватывает process.exit(1) сразу после console.error с текстом про
 *     402/restricted/квоту: часть скриптов выходит прямо в месте ошибки, без
 *     throw, и другого способа перехватить это нет.
 */

const QUOTA_RE =
  /exceed_egress_quota|restricted due to|project is restricted|service for this project is restricted|egress quota|quota exceeded|HTTP 402|\b402\b/i;

/** Текст ошибки — «это блокировка по квоте?» */
export function isQuotaText(text) {
  return typeof text === 'string' && QUOTA_RE.test(text);
}

/** Ошибка supabase-js / fetch / Error — «это блокировка по квоте?» */
export function isQuotaError(err) {
  if (!err) return false;
  if (typeof err === 'string') return isQuotaText(err);
  const parts = [
    err.message,
    err.details,
    err.hint,
    err.code,
    err.cause?.message,
    err.status,
    err.statusCode,
  ];
  return parts.some((p) => isQuotaText(String(p ?? '')));
}

export const QUOTA_SKIP_MESSAGE = 'База недоступна по квоте, пропуск';

/** Единая точка выхода: пишет строку и завершает прогон успешно */
export function quotaSkip() {
  console.log(QUOTA_SKIP_MESSAGE);
  process.exit(0);
}

let installed = false;

export function installQuotaGuard() {
  if (installed) return;
  installed = true;

  process.on('unhandledRejection', (reason) => {
    if (isQuotaError(reason)) quotaSkip();
    console.error('Необработанная ошибка:', reason?.message ?? reason);
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    if (isQuotaError(err)) quotaSkip();
    console.error('Необработанная ошибка:', err?.message ?? err);
    process.exit(1);
  });

  // Перехват «console.error(...); process.exit(1)» внутри main(): такие места
  // не бросают исключение, поэтому обработчики выше их не видят.
  let lastErrorText = '';
  const origError = console.error.bind(console);
  console.error = (...args) => {
    lastErrorText = args
      .map((a) => (a instanceof Error ? a.message : String(a)))
      .join(' ');
    origError(...args);
  };

  const origExit = process.exit.bind(process);
  process.exit = ((code) => {
    if (code !== 0 && isQuotaText(lastErrorText)) {
      origError(QUOTA_SKIP_MESSAGE);
      return origExit(0);
    }
    return origExit(code);
  });
}

installQuotaGuard();
