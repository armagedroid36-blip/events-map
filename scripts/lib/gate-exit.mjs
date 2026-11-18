/**
 * Код выхода гейтов сборки: одна таблица решений для тестов и для скрипта.
 *
 * Правило (18.11.2026): красный прогон — только ДЕФЕКТ ДАННЫХ. Разовый отказ
 * вспомогательного RPC не валит деплой, если проверка прошла поштучно и
 * кандидатов 0 (кейс: `statement timeout` у list_past_events на шаге 21
 * пересборки 44213154316 при 0 мягких 404).
 */

/** Гейт «sitemap резолвится SPA»: 1 — есть нерезолвящиеся URL (Soft 404),
 *  2 — вывод сделать нельзя (сетевые сбои поштучной проверки либо нет
 *  опубликованного снимка удалённых событий), 0 — чисто. */
export function finalCode({ unresolvedCount = 0, badStatusCount = 0, netErrorsCount = 0, legacyProd = true } = {}) {
  if (unresolvedCount || badStatusCount) return 1;
  if (netErrorsCount || !legacyProd) return 2;
  return 0;
}
