#!/usr/bin/env node
/**
 * Перепись по снимку витрины: каким ЖИВЫМ карточкам правило townFromName
 * (scripts/cy-districts.mjs, введено в 1121) сменит метку города.
 * 0 запросов к базе — читает data/events.json с cache-buster.
 * Печатает id, старую и новую метку, адрес/название-улику.
 */
import { townFromName } from './cy-districts.mjs'

const SNAP = 'https://mypins.site/data/events.json'
const res = await fetch(`${SNAP}?v=${Date.now()}`)
const json = await res.json()
const cards = json.cards || json.events || []
console.log(`снимок: generated_at ${json.generated_at || '?'}, карточек ${cards.length}`)

let n = 0
for (const c of cards) {
  const city = c.city
  if (!city) continue
  const text = [c.address, c.title, c.title_en, c.title_ru].filter(Boolean).join(' | ')
  const next = townFromName(city, text)
  if (next && next !== city) {
    n++
    console.log(`${String(c.id).slice(0, 8)}  ${city} -> ${next}  |  ${String(c.address || '').slice(0, 70)}  |  ${String(c.title || '').slice(0, 50)}`)
  }
}
console.log(`к смене метки: ${n}`)
