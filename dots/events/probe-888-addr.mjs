import fs from 'node:fs';
import { cardAddressBali } from 'file:///C:/Users/armag/projects/events-map/scripts/bali-address.mjs';
const d = JSON.parse(fs.readFileSync(process.env.LOCALAPPDATA + '/Temp/prod-884.json', 'utf8'));
const cards = d.cards;
for (const [name, sel] of [
  ['BALI', (c) => (c.city || '').includes('Bali')],
  ['VN', (c) => /Дананг|Нячанг/.test(c.city || '')],
]) {
  const g = cards.filter(sel);
  let ch = 0; const ex = [];
  for (const c of g) {
    const a = c.address == null ? null : c.address;
    const now = cardAddressBali(a, c.city || null);
    if ((a ?? null) !== now) { ch++; if (ex.length < 4) ex.push([c.id.slice(0, 8), a, now]); }
  }
  console.log(name, 'карточек', g.length, 'меняется', ch);
  for (const e of ex) console.log('   ', JSON.stringify(e));
}
