#!/usr/bin/env node
/**
 * Ремонт пары, подтверждённой ОФЛАЙН по прод-снимку + ленте Cyprus Now (запуск 1104, блокер 402).
 *
 *  «Blue Mind» в галерее In Toto (Никосия), открытие 26.11:
 *    canon 15a731ea «Blue Mind»        26.11 17:30 -> 13.12 23:00, пин 35.1620037,33.3521957
 *    dup   9c7354c7 «Открытие: Blue Mind» 26.11 19:00, пин 35.1872,33.3811 (Каимакли, 2.9 км)
 *
 *  Арбитр — лента Cyprus Now `GET /api/events?q=blue mind` (одна запись
 *  `blue-mind-2026-11-26`): title «Blue Mind», venue «In Toto Gallery»
 *  35.1620037,33.3521957, start_at 2026-11-26T15:30Z = 17:30 местного (UTC+2).
 *  То есть у источника ОДНО событие с точкой и временем канона; карточка
 *  «Открытие» несёт выдуманное время 19:00 и пин в другом районе -> дубль.
 *
 * Гейты: обе active, одна дата, «blue mind» в названиях обеих, «in toto» в адресах
 * обеих, у канона есть end_date (интервал выставки), точки разъехались > 500 м.
 * DRY по умолчанию. При 402 отказ с кодом 1.
 *
 * Запуск: node --env-file=.env scripts/dot-1104-intoto-opening-dupe-fix.mjs
 *         APPLY=1 node --env-file=.env scripts/dot-1104-intoto-opening-dupe-fix.mjs
 */
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE (запускать с --env-file=.env)'); process.exit(2) }

const PAIR = {
  date: '2026-11-26',
  canon: '15a731ea',
  dup: '9c7354c7',
  word: 'blue mind',
  addr: 'in toto',
  note: 'Cyprus Now ?q=blue mind -> In Toto Gallery 35.1620037,33.3521957, 26.11 17:30 (15:30Z+2); открытие = та же выставка',
}
const APPLY = process.env.APPLY === '1'
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

const dist = (a, b) => {
  const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function fetchDay(date) {
  const u = `${URL_}/rest/v1/events?start_date=eq.${date}&select=id,title,start_date,start_time,end_date,end_time,lat,lng,city,address,status`
  const r = await fetch(u, { headers: H })
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${(await r.text()).slice(0, 200)}`), { status: r.status })
  return r.json()
}

async function main() {
  let archived = 0
  let rows
  try { rows = await fetchDay(PAIR.date) } catch (e) {
    if (e.status === 402) { console.error('402 egress quota — ремонт отменён, квота не снята'); process.exit(1) }
    throw e
  }
  const canon = rows.find(r => r.id.startsWith(PAIR.canon))
  const dup = rows.find(r => r.id.startsWith(PAIR.dup))
  if (!canon || !dup) { console.log(`SKIP ${PAIR.canon}/${PAIR.dup}: карточки не найдены на ${PAIR.date}`); return }
  const lc = (s) => (s || '').toLowerCase()
  const gates = [
    [canon.status === 'active' && dup.status === 'active', 'обе active'],
    [canon.start_date === PAIR.date && dup.start_date === PAIR.date, `дата ${PAIR.date}`],
    [lc(canon.title).includes(PAIR.word) && lc(dup.title).includes(PAIR.word), `названия содержат «${PAIR.word}»`],
    [lc(canon.address).includes(PAIR.addr) && lc(dup.address).includes(PAIR.addr), `адреса содержат «${PAIR.addr}»`],
    [!!canon.end_date, 'у канона интервал (end_date)'],
    [canon.lat != null && dup.lat != null && dist([canon.lat, canon.lng], [dup.lat, dup.lng]) > 500, 'пины разъехались > 500 м'],
  ]
  const bad = gates.filter(g => !g[0]).map(g => g[1])
  if (bad.length) { console.log(`SKIP ${PAIR.canon}/${PAIR.dup}: гейты не прошли (${bad.join(', ')})`); return }
  console.log(`${APPLY ? 'PATCH' : 'DRY'} ${PAIR.date}: канон ${canon.id.slice(0, 8)} «${canon.title}» ${canon.start_time} -> ${canon.end_date}, дубль ${dup.id.slice(0, 8)} «${dup.title}» ${dup.start_time} — ${PAIR.note}`)
  if (!APPLY) return
  const res = await fetch(`${URL_}/rest/v1/events?id=eq.${dup.id}&status=eq.active`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', reviewer: 'dot-1104', note: PAIR.note, canon: canon.id } }),
  })
  if (!res.ok) { console.error(`  ошибка ${res.status}: ${(await res.text()).slice(0, 200)}`); return }
  const out = await res.json()
  if (out.length === 1) { archived++; console.log(`  ok: ${dup.id.slice(0, 8)} archived`) }
  console.log(`Готово: архивных ${archived}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
