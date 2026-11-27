#!/usr/bin/env node
/**
 * Единая точка применения ОЧЕРЕДИ отложенных ремонтов dot-events (1098..1104).
 *
 * Зачем: пока REST Supabase отвечает 402 (exceed_egress_quota), шесть ремонтов
 * стоят готовыми скриптами. Применять их вручную по одному — риск спутать
 * порядок. Порядок ВАЖЕН: пара 1104 датирована 26.11 (уже прошла), её надо
 * применить первой, иначе `archive-past` снимет канон раньше скрипта.
 *
 * Что делает:
 *   1) пробует дешёвое чтение `select=id&limit=1`; при 402 — выходит с кодом 2
 *      и НИЧЕГО не применяет (ключи не печатает);
 *   2) последовательно запускает fix-скрипты с APPLY=1, останавливаясь на первом
 *      ненулевом коде (фиксирует, на каком шаге очередь встала);
 *   3) печатает readback: count=exact живых карточек и вердикт по каждой цели
 *      (в каком статусе строка сейчас);
 *   4) с флагом --rebuild диспатчит `rebuild-pages` (PAT берётся из
 *      `git credential fill`, значение не печатается).
 *
 * Запуск:
 *   node --env-file=.env scripts/dot-1107-apply-queue.mjs            # применить
 *   node --env-file=.env scripts/dot-1107-apply-queue.mjs --rebuild   # + пересборка
 *   node --env-file=.env scripts/dot-1107-apply-queue.mjs --dry        # только порядок
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
if (!URL_ || !KEY) {
  console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE (запускать с --env-file=.env)')
  process.exit(2)
}

const REPO = 'armagedroid36-blip/events-map'
const DRY = process.argv.includes('--dry')
const REBUILD = process.argv.includes('--rebuild')

// Порядок применения: 1104 первым (дата 26.11 уже прошла), затем остальные.
const QUEUE = [
  ['dot-1104', 'scripts/dot-1104-intoto-opening-dupe-fix.mjs', ['15a731ea', '9c7354c7']],
  ['dot-1103', 'scripts/dot-1103-centroid-venue-fix.mjs', ['8c8ab47e', '2b39ece2', '7eb675b6', 'a3ca74fa']],
  ['dot-1101', 'scripts/dot-1101-snapshot-dupe-fix.mjs', ['06cb35d8', '08f5164d', '3e921cbb', '809d3c65', '96623d2a', '976a7352', 'ad248603', 'ad5d8100', 'c0b0d0a7', 'cfad1e23']],
  ['dot-1100', 'scripts/dot-1100-pair-dupe-fix.mjs', ['2b39ece2', 'c6da82ad', '52769ed7', 'f236bd50']],
  ['dot-1099', 'scripts/dot-1099-ru-en-dupe-fix.mjs', ['04063895', '18c60b9c', '06442e7a', 'cc368fee']],
  ['dot-1098', 'scripts/dot-1098-makis-dupe-fix.mjs', ['6ce9b389', '173fc77c']],
  ['dot-1109', 'scripts/dot-1109-translation-dupe-fix.mjs', ['5f5b6f64', '524ed2da']],
  ['dot-1111', 'scripts/dot-1111-address-url-fix.mjs', ['bcbfd122']],
]

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Encoding': 'identity' }

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
  const text = await res.text()
  return { status: res.status, text, headers: res.headers }
}

async function main() {
  console.log(`Очередь (${QUEUE.length}): ${QUEUE.map(q => q[0]).join(' -> ')}`)
  const ids = new Set(QUEUE.flatMap(q => q[2]))
  const sumIds = QUEUE.reduce((n, q) => n + q[2].length, 0)
  console.log(`Целей: ${sumIds} в скриптах, ${ids.size} уникальных (2b39ece2 общая у 1100/1103; preflight dot-1105 ждёт 26/25)`)
  const missing = QUEUE.filter(q => !existsSync(q[1])).map(q => q[1])
  if (missing.length) { console.log(`НЕТ ФАЙЛОВ: ${missing.join(', ')}`); process.exit(4) }

  // 1. Гейт блокера
  const probe = await rest('events?select=id&limit=1')
  if (probe.status === 402) {
    console.log('БЛОКЕР: REST отдаёт 402 (egress quota) — очередь НЕ применяется, ничего не сделано.')
    process.exit(2)
  }
  if (probe.status >= 400) {
    console.log(`REST ответил ${probe.status} — очередь не применяю: ${probe.text.slice(0, 200)}`)
    process.exit(3)
  }
  console.log('Гейт пройден: REST отвечает 200, квота снята.')

  if (DRY) { console.log('DRY: порядок показан, применения нет.'); return }

  // 2. Последовательное применение
  const results = []
  for (const [tag, file, ids] of QUEUE) {
    console.log(`\n=== ${tag} (${file})`)
    const r = spawnSync(process.execPath, [`--env-file=.env`, file], {
      cwd: process.cwd(),
      env: { ...process.env, APPLY: '1' },
      encoding: 'utf8',
      timeout: 240000,
    })
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-8).join('\n')
    console.log(out || '(нет вывода)')
    results.push({ tag, code: r.status === null ? 'timeout' : r.status, ids })
    if (r.status !== 0) {
      console.log(`ОСТАНОВ: ${tag} завершился с кодом ${r.status} — следующие ремонты не применялись.`)
      break
    }
  }

  // 3. Readback по целям + счётчик живых
  const allIds = [...new Set(results.flatMap(r => r.ids))]
  if (allIds.length) {
    const rb = await rest(`events?select=id,status,start_date,lat,lng&id=in.(${allIds.join(',')})`)
    if (rb.status === 200) {
      const rows = JSON.parse(rb.text)
      const map = new Map(rows.map(r => [r.id.slice(0, 8), r]))
      for (const id of allIds) {
        const row = map.get(id)
        console.log(`  ${id}: ${row ? `${row.status} ${row.start_date} ${row.lat},${row.lng}` : 'НЕ НАЙДЕНА'}`)
      }
    } else console.log(`readback не прочитан: ${rb.status}`)
  }
  const cnt = await rest('events?select=id&status=eq.active&limit=1', { headers: { Prefer: 'count=exact' } })
  const range = cnt.headers.get('content-range')
  console.log(`\nЖивых (active): ${range ? range.split('/')[1] : '?'}`)
  for (const r of results) console.log(`${r.tag}: exit ${r.code}`)

  // 4. Пересборка витрины
  if (REBUILD) {
    const g = spawnSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    })
    const pat = (g.stdout || '').split('\n').find(l => l.startsWith('password='))?.slice(9)
    if (!pat) { console.log('PAT не получен — rebuild не диспатчу'); return }
    const d = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/rebuild-pages.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    })
    console.log(`rebuild-pages dispatch: ${d.status}`)
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
