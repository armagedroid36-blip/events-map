// Квота на город внутри общего бюджета прогона.
//
// Фиксированная доля budget/кол-во городов съедает прогон ровно на своём значении:
// при budget=120 и 7 городах Cyprus Now каждому доставалось 18, а прогон добавлял
// 59 карточек (замер 916: backlog 134), т.е. половина бюджета не использовалась.
// Считать квоту на КАЖДОЙ итерации по остатку даёт большим городам неизрасходованное
// малыми, а гарантия «каждому не меньше равной доли» сохраняется (минимум 15).
//
// budget  — общий лимит прогона
// added   — сколько уже добавлено в этом прогоне
// left    — сколько городов ещё не обслужено (включая текущий)
export function cityQuota(budget, added, left, minPerCity = 15) {
  const remaining = Number(budget) - Number(added);
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!Number.isFinite(left) || left <= 0) return 0;
  const fair = Math.ceil(remaining / left);
  return Math.min(remaining, Math.max(minPerCity, fair));
}
