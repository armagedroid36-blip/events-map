// Зонд 885: не режет ли санитайзер cardAddress (883) НОРМАЛЬНЫЕ адреса.
// Берёт ЖИВУЮ функцию из scripts/collect-cyprus.mjs (импорт, не копия логики),
// гоняет по всем адресам прод-снапшота и печатает: сколько адресов меняется,
// какие теряют СОДЕРЖАТЕЛЬНУЮ часть (не только страну), плюс контроль на заглушке.
// Запуск: node dots/events/probe-885-addr.mjs [путь к снапшоту]
import fs from 'node:fs';
import path from 'node:path';

process.env.DRY_RUN = '1';
const { cardAddress } = await import('../../scripts/collect-cyprus.mjs');

const snapPath = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'prod-884.json');
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const cards = snap.cards || snap.events || [];
console.log(`снапшот: ${cards.length} карточек, файл ${path.basename(snapPath)}`);

const COUNTRY = ['cyprus', 'кипр', 'κύπρος', 'κυπρος', 'kypros'];
const cy = cards.filter((c) => /кипр|cyprus/i.test(String(c.city || '')));
let same = 0;
const changed = [];
for (const c of cy) {
  const addr = String(c.address || '').trim();
  if (!addr) continue;
  const out = cardAddress([addr], c.city);
  if (out === addr) { same++; continue; }
  const keep = [];
  for (const p of addr.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (COUNTRY.includes(p.toLowerCase())) continue;
    if (keep.some((x) => x.toLowerCase() === p.toLowerCase())) continue;
    keep.push(p);
  }
  const expected = keep.join(', ');
  const contentLost = out === null || (keep.length > 0 && out.replace(/, (кипр|cyprus)$/i, '') !== expected.replace(/, (кипр|cyprus)$/i, '') && !out.startsWith(expected));
  changed.push({ id: String(c.id || '').slice(0, 8), from: addr, to: out, contentLost });
}

const withAddr = cy.filter((c) => String(c.address || '').trim()).length;
console.log(`кипрских карточек с адресом: ${withAddr}, без изменений: ${same}, меняется: ${changed.length}`);
const bad = changed.filter((x) => x.contentLost);
console.log(`содержательных потерь: ${bad.length}`);
for (const x of bad.slice(0, 15)) console.log(`  БЕДА ${x.id}: «${x.from}» -> «${x.to}»`);
for (const x of changed.slice(0, 12)) console.log(`  ${x.id}: «${x.from}» -> «${x.to}»`);

console.log(`КОНТРОЛЬ заглушки: «Cyprus, Cyprus» -> «${cardAddress(['Cyprus', 'Cyprus'], 'Никосия, Кипр')}»`);
console.log(`КОНТРОЛЬ улицы: «28 Oktovriou 12, Limassol, Cyprus» -> «${cardAddress(['28 Oktovriou 12, Limassol', 'Cyprus'])}»`);
