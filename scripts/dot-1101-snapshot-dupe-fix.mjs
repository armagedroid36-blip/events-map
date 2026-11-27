#!/usr/bin/env node
/**
 * Ремонт дублей, подтверждённых ОФЛАЙН по прод-снимку (запуск 1101, блокер 402).
 * Применять, когда квота egress снята.
 *
 *  P1 2026-12-06 17:00 «No Where to Wear This: Girls Only Party in Limassol» ↔
 *     «Nowhere to Wear This» — Lab Bar, Restaurant, одна точка 34.675630,33.045874,
 *     один интервал 17:00–22:00. Канон — 06cb35d8 (в названии тип события и город).
 *
 *  P2–P5 серия на площади Элефтерия: карточки рынка (интервал, есть end_time) и
 *     греческие по-датные записи «Η Λευκωσία υποδέχεται ξανά το Χριστουγεννιάτικο
 *     Χωριό της!» стоят в ОДНОЙ точке 35.1699953,33.3602499 и в одно время 11:00.
 *     Арбитр: en.philenews.com и cyprus-mail.com (20.11.2026) — Nicosia Christmas
 *     Market (Handmade in Cyprus + муниципалитет) 28.11–27.12 на Eleftheria Square
 *     «turns the square into a Christmas Village», часы 11:00–20:00 в даты
 *     28–29.11 / 12–13.12 / 19–20.12 / 24.12 / 27.12 = ровно даты греческой серии.
 *     Канон — карточка рынка (интервал + end_time), греческая по-датная копия → архив.
 *
 * Гейты: обе карточки active, дата и время начала совпадают, точки < 300 м,
 * названия содержат ключевое слово, city совпадает. DRY по умолчанию.
 * При 402 скрипт отказывается и выходит с кодом 1.
 *
 * Запуск: node --env-file=.env scripts/dot-1101-snapshot-dupe-fix.mjs
 *         APPLY=1 node --env-file=.env scripts/dot-1101-snapshot-dupe-fix.mjs
 */
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE (запускать с --env-file=.env)'); process.exit(2) }

const PAIRS = [
  { date: '2026-12-06', time: '17:00', canon: '06cb35d8', dup: '976a7352', word: 'wear this',
    note: 'Lab Bar, Restaurant, Лимасол: одна точка 34.675630,33.045874, один интервал 17:00-22:00' },
  { date: '2026-11-28', time: '11:00', canon: 'cfad1e23', dup: 'ad5d8100', word: 'christmas',
    note: 'Eleftheria Square 11:00: рынок 28-29.11 и есть «Christmas Village» (philenews, cyprus-mail)' },
  { date: '2026-12-12', time: '11:00', canon: '08f5164d', dup: 'ad248603', word: 'christmas',
    note: 'Eleftheria Square 11:00: рынок 12-13.12 и есть «Christmas Village» (philenews, cyprus-mail)' },
  { date: '2026-12-19', time: '11:00', canon: '3e921cbb', dup: '96623d2a', word: 'christmas',
    note: 'Eleftheria Square 11:00: рынок 19-24.12 и есть «Christmas Village» (philenews, cyprus-mail)' },
  { date: '2026-12-27', time: '11:00', canon: '809d3c65', dup: 'c0b0d0a7', word: 'christmas',
    note: 'Eleftheria Square 11:00: рынок 27.12 и есть «Christmas Village» (philenews, cyprus-mail)' },
]
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
  for (const p of PAIRS) {
    let rows
    try { rows = await fetchDay(p.date) } catch (e) {
      if (e.status === 402) { console.error('402 egress quota — ремонт отменён, квота не снята'); process.exit(1) }
      throw e
    }
    const canon = rows.find(r => r.id.startsWith(p.canon))
    const dup = rows.find(r => r.id.startsWith(p.dup))
    if (!canon || !dup) { console.log(`SKIP ${p.canon}/${p.dup}: карточки не найдены на ${p.date}`); continue }
    const lc = (s) => (s || '').toLowerCase()
    const gates = [
      [canon.status === 'active' && dup.status === 'active', 'обе active'],
      [canon.start_time === p.time && dup.start_time === p.time, `время начала ${p.time}`],
      [canon.lat != null && dup.lat != null && dist([canon.lat, canon.lng], [dup.lat, dup.lng]) < 300, 'точки < 300 м'],
      [lc(canon.title).includes(p.word) && lc(dup.title).includes(p.word), `названия содержат «${p.word}»`],
      [canon.city === dup.city, 'city совпадает'],
    ]
    const bad = gates.filter(g => !g[0]).map(g => g[1])
    if (bad.length) { console.log(`SKIP ${p.canon}/${p.dup}: гейты не прошли (${bad.join(', ')})`); continue }
    console.log(`${APPLY ? 'PATCH' : 'DRY'} ${p.date} ${p.time}: канон ${canon.id.slice(0, 8)} «${canon.title}», дубль ${dup.id.slice(0, 8)} «${dup.title}» — ${p.note}`)
    if (!APPLY) continue
    const res = await fetch(`${URL_}/rest/v1/events?id=eq.${dup.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', reviewer: 'dot-1101', note: p.note, canon: canon.id } }),
    })
    if (!res.ok) { console.error(`  ошибка ${res.status}: ${(await res.text()).slice(0, 200)}`); continue }
    const out = await res.json()
    if (out.length === 1) { archived++; console.log(`  ok: ${dup.id.slice(0, 8)} archived`) }
  }
  console.log(`Готово: архивных ${APPLY ? archived : 0} (DRY=${!APPLY})`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
