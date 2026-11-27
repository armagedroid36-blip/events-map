#!/usr/bin/env node
/**
 * Ремонт дубля, подтверждённого ОФЛАЙН по прод-снимку (запуск 1109, блокер 402).
 * Применять, когда квота egress снята.
 *
 *  2026-11-28 10:30 «Παρασκευή τρεμιθόπιτας» (архив) ↔
 *  «Мастер-класс по тремитопите, кипрскому деревенскому пирогу» (канон) —
 *  деревня Труллои, точки 35.0331385,33.6155767 и 35.0324148,33.6156632 (81 м),
 *  одна дата и одно время начала. Канон — 5f5b6f64: есть end_time 12:30 и
 *  адрес с названием места (Kafenio to Kantouni, Труллои).
 *  Найдено зондом dot-1109-translation-dupe-probe.py (пары «перевод без общих слов»,
 *  которые near-dupe 1099 и cross-source-зонд не видят: у названий 0-1 общее слово).
 *
 * Гейты: обе карточки active, та же дата и то же время начала, точки < 300 м,
 * city совпадает. DRY по умолчанию. При 402 — отказ, код 1.
 *
 * Запуск: node --env-file=.env scripts/dot-1109-translation-dupe-fix.mjs
 *         APPLY=1 node --env-file=.env scripts/dot-1109-translation-dupe-fix.mjs
 */
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE (запускать с --env-file=.env)'); process.exit(2) }

const PAIRS = [
  { date: '2026-11-28', time: '10:30', canon: '5f5b6f64', dup: '524ed2da',
    note: 'Труллои: мастер-класс по тремитопите, одна дата/время 10:30, точки 81 м (греч. «Παρασκευή τρεμιθόπιτας»)' },
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
    const gates = [
      [canon.status === 'active', `канон ${p.canon} не active (${canon.status})`],
      [dup.status === 'active', `копия ${p.dup} не active (${dup.status})`],
      [canon.start_time === p.time && dup.start_time === p.time, `время не ${p.time} (${canon.start_time}/${dup.start_time})`],
      [canon.city === dup.city, `city расходится (${canon.city} / ${dup.city})`],
      [dist([canon.lat, canon.lng], [dup.lat, dup.lng]) < 300,
        `точки дальше 300 м (${Math.round(dist([canon.lat, canon.lng], [dup.lat, dup.lng]))} м)`],
    ]
    const bad = gates.filter(g => !g[0]).map(g => g[1])
    if (bad.length) { console.log(`SKIP ${p.canon}/${p.dup}: ${bad.join('; ')}`); continue }
    console.log(`${p.canon} ← канон, ${p.dup} → archived/duplicate :: ${p.note}`)
    if (!APPLY) continue
    const body = {
      status: 'archived',
      auto_review: { verdict: 'reject', reason: 'duplicate', note: `dot 1109: ${p.note}; канон ${p.canon}`, at: new Date().toISOString() },
    }
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${dup.id}&status=eq.active`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!r.ok) { console.error(`PATCH ${p.dup}: ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1) }
    const got = await r.json()
    console.log(`  readback ${p.dup}: ${got.length} строк(а) ${got[0] ? got[0].status : '—'}`)
    archived += got.length
  }
  console.log(APPLY ? `Готово: архивировано ${archived}` : 'DRY: правок нет (APPLY=1 для применения)')
}

main().catch(e => { console.error('ошибка:', e.message); process.exit(1) })
