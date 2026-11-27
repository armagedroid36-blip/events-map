#!/usr/bin/env node
/**
 * Ремонт двух подтверждённых офлайн-дублей (запуск 1100), найденных зондом
 * dot-snapshot-near-dupe.py при блокере 402. Применять, когда квота egress снята.
 *
 *  P1 2026-12-12 09:00 «Christmas Festival at CyHerbia» ↔ «Christmas Festival 2026 at
 *     Cyherbia Botanical Park» — одна площадка (CyHerbia Botanical Park & Labyrinth),
 *     одна точка 35.0139109,33.830378, один интервал 12.12 09:00 → 13.12 17:00.
 *     Канон — 2b39ece2 (адрес называет парк и округ).
 *  P2 2026-12-06 12:00 «German Christmas Market 2026» ↔ «The German Christmas Fayre
 *     Returns to the Heart of Nicosia on 6 December!» — Eleftheria Square, один пин
 *     35.1699953,33.3602499. Канон — 52769ed7 (есть end_time 20:00).
 *
 * Гейты: обе карточки active, дата и время начала совпадают, точки < 300 м,
 * название дубля содержит ключевое слово канона. DRY по умолчанию.
 * При 402 скрипт отказывается и выходит с кодом 1.
 *
 * Запуск: node --env-file=.env scripts/dot-1100-pair-dupe-fix.mjs
 *         APPLY=1 node --env-file=.env scripts/dot-1100-pair-dupe-fix.mjs
 */
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE (запускать с --env-file=.env)'); process.exit(2) }

const PAIRS = [
  { date: '2026-12-12', time: '09:00', canon: '2b39ece2', dup: 'c6da82ad', word: 'cyherbia',
    note: 'CyHerbia Botanical Park & Labyrinth: одна точка 35.0139109,33.830378, один интервал 12.12 09:00 – 13.12 17:00' },
  { date: '2026-12-06', time: '12:00', canon: '52769ed7', dup: 'f236bd50', word: 'german christmas',
    note: 'Eleftheria Square, Никосия: одна точка 35.1699953,33.3602499, дата и время начала 06.12 12:00 совпадают' },
]
const APPLY = process.env.APPLY === '1'
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

const dist = (a, b) => {
  const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function fetchDay(date) {
  const u = `${URL_}/rest/v1/events?start_date=eq.${date}&select=id,title,start_date,start_time,end_date,end_time,lat,lng,city,address,website,status`
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
    const titleOk = ((dup.title || '').toLowerCase().includes(p.word)) || ((canon.title || '').toLowerCase().includes(p.word))
    const gates = [
      [canon.status === 'active' && dup.status === 'active', 'обе active'],
      [canon.start_time === p.time && dup.start_time === p.time, `время начала ${p.time}`],
      [canon.lat != null && dup.lat != null && dist([canon.lat, canon.lng], [dup.lat, dup.lng]) < 300, 'точки < 300 м'],
      [titleOk, `название содержит «${p.word}»`],
    ]
    const bad = gates.filter(g => !g[0]).map(g => g[1])
    if (bad.length) { console.log(`SKIP ${p.canon}/${p.dup}: гейты не прошли (${bad.join(', ')})`); continue }
    console.log(`${APPLY ? 'PATCH' : 'DRY'} ${p.date} ${p.time}: канон ${canon.id.slice(0, 8)} «${canon.title}», дубль ${dup.id.slice(0, 8)} «${dup.title}» — ${p.note}`)
    if (!APPLY) continue
    const res = await fetch(`${URL_}/rest/v1/events?id=eq.${dup.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', reviewer: 'dot-1100', note: p.note, canon: canon.id } }),
    })
    if (!res.ok) { console.error(`  ошибка ${res.status}: ${(await res.text()).slice(0, 200)}`); continue }
    const out = await res.json()
    if (out.length === 1) { archived++; console.log(`  ok: ${dup.id.slice(0, 8)} archived`) }
  }
  console.log(`Готово: архивных ${APPLY ? archived : 0} (DRY=${!APPLY})`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
