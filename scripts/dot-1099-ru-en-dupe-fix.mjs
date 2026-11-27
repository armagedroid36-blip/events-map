#!/usr/bin/env node
/**
 * Ремонт кросс-языковых дублей, найденных офлайн-зондом dot-snapshot-near-dupe.py
 * при блокере 402 (база не читается/не пишется). Применять, когда квота egress снята.
 *
 * Пары (одна дата + одно время + точки в пределах 300 м + название = перевод):
 *  P1 2026-11-29 11:00  «Воскресная мастерская: украшения и подвески в Лимассоле» (RU)
 *                       «Sunday Workshop: Jewellery & Charms in Limassol» (EN)
 *  P2 2026-12-11 20:30  «CYPRUS SYMPHONY ORCHESTRA – CINEMATIC MUSIC – 11.12.2026»
 *                       «Киномузыка»
 *
 * Канон выбирается по данным: карточка с заполненными website+address остаётся,
 * вторая уходит в archived с auto_review reject/duplicate. Гейты: обе карточки
 * active, дата/время совпадают, точки < 300 м. DRY по умолчанию.
 *
 * Запуск: node --env-file=.env scripts/dot-1099-ru-en-dupe-fix.mjs
 *         APPLY=1 node --env-file=.env scripts/dot-1099-ru-en-dupe-fix.mjs
 */
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE (запускать с --env-file=.env)'); process.exit(2) }

const PAIRS = [
  { date: '2026-11-29', time: '11:00', a: '04063895', b: '18c60b9c',
    note: 'RU «Воскресная мастерская: украшения и подвески в Лимассоле» = EN «Sunday Workshop: Jewellery & Charms in Limassol»' },
  { date: '2026-12-11', time: '20:30', a: '06442e7a', b: 'cc368fee',
    note: '«CYPRUS SYMPHONY ORCHESTRA – CINEMATIC MUSIC» = «Киномузыка» (тот же концерт, перевод названия)' },
]
const APPLY = process.env.APPLY === '1'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const dist = (a, b) => {
  const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function fetchDay(date) {
  const u = `${URL_}/rest/v1/events?start_date=eq.${date}&select=id,title,start_date,start_time,lat,lng,city,address,website,status`
  const r = await fetch(u, { headers: H })
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${await r.text()}`), { status: r.status })
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
    const a = rows.find(r => r.id.startsWith(p.a)), b = rows.find(r => r.id.startsWith(p.b))
    if (!a || !b) { console.log(`SKIP ${p.a}/${p.b}: карточки не найдены на ${p.date}`); continue }
    const gates = [
      [a.status === 'active' && b.status === 'active', 'обе active'],
      [a.start_time === p.time && b.start_time === p.time, `время ${p.time}`],
      [a.lat != null && b.lat != null && dist([a.lat, a.lng], [b.lat, b.lng]) < 300, 'точки < 300 м'],
    ]
    const bad = gates.filter(g => !g[0]).map(g => g[1])
    if (bad.length) { console.log(`SKIP ${p.a}/${p.b}: гейты не прошли (${bad.join(', ')})`); continue }
    const score = r => (r.website ? 2 : 0) + (r.address ? 1 : 0)
    const canon = score(a) >= score(b) ? a : b
    const dup = canon.id === a.id ? b : a
    console.log(`${APPLY ? 'PATCH' : 'DRY'} ${p.date} ${p.time}: канон ${canon.id.slice(0, 8)} «${canon.title}», дубль ${dup.id.slice(0, 8)} «${dup.title}» — ${p.note}`)
    if (!APPLY) continue
    const res = await fetch(`${URL_}/rest/v1/events?id=eq.${dup.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', reviewer: 'dot-1099', note: p.note, canon: canon.id } }),
    })
    if (!res.ok) { console.error(`  ошибка ${res.status}: ${(await res.text()).slice(0, 200)}`); continue }
    const out = await res.json()
    if (out.length === 1) { archived++; console.log(`  ok: ${dup.id.slice(0, 8)} archived`) }
  }
  console.log(`Готово: архивных ${APPLY ? archived : 0} (DRY=${!APPLY})`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
