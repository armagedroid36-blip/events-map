// Зонд 889: ЕДИНЫЙ ГЕЙТ санитайзеров адреса по всем сборщикам (883/885/887/888).
// A) живой перемер по снапшоту: Кипр -> cardAddress, Бали/Вьетнам -> cardAddressBali
//    (ожидание: Кипр меняет ровно цели cy-addr-884-apply.mjs, Бали/VN 0);
// B) статическая проверка всех сборщиков: в точке сборки строки адрес проходит
//    санитайзер (cardAddress / cardAddressBali / cleanAddress), иначе это дырка класса 887.
// Запуск: node dots/events/probe-889-addr-gate.mjs [снапшот]
import fs from 'node:fs';
import path from 'node:path';

process.env.DRY_RUN = '1';
const { cardAddress } = await import('../../scripts/collect-cyprus.mjs');
const { cardAddressBali } = await import('../../scripts/bali-address.mjs');

const snapPath = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'prod-888.json');
const probeSnap = fs.existsSync(snapPath) ? snapPath : path.join(process.env.LOCALAPPDATA || '', 'Temp', 'prod-884.json');
const cards = JSON.parse(fs.readFileSync(probeSnap, 'utf8')).cards || [];
console.log(`снапшот: ${cards.length} карточек (${path.basename(probeSnap)})`);

// --- цели миграции 884 (id -> ожидаемое НОВОЕ значение) ---
const applySrc = fs.readFileSync(new URL('./cy-addr-884-apply.mjs', import.meta.url), 'utf8');
const targets = new Map();
for (const m of applySrc.matchAll(/\{\s*id:\s*'([0-9a-f]{8})'([^}]*)\}/g)) {
  const body = m[2];
  const to = /to:\s*'([^']*)'/.exec(body);
  const city = /expectCity:\s*'([^']*)'/.exec(body);
  targets.set(m[1], to ? to[1] : city ? `${city[1]}, Кипр` : null);
}
console.log(`целей cy-addr-884-apply: ${targets.size}`);

const regions = [
  ['КИПР', (c) => /кипр|cyprus/i.test(String(c.city || '')), (a, city) => cardAddress([a], city), true],
  ['БАЛИ', (c) => String(c.city || '').includes('Bali'), (a, city) => cardAddressBali(a, city), false],
  ['ВЬЕТНАМ', (c) => /Дананг|Нячанг/.test(String(c.city || '')), (a, city) => cardAddressBali(a, city), false],
];

let totalChanged = 0;
let mismatch = 0;
for (const [name, sel, fn, isCy] of regions) {
  const group = cards.filter(sel);
  const changed = [];
  for (const c of group) {
    const a = c.address == null ? null : String(c.address);
    const out = fn(a, c.city);
    if ((a ?? null) !== (out ?? null)) changed.push([String(c.id).slice(0, 8), a, out]);
  }
  totalChanged += changed.length;
  console.log(`${name}: карточек ${group.length}, меняется ${changed.length}`);
  for (const [id, a, out] of changed.slice(0, 20)) console.log(`    ${id}  ${JSON.stringify(a)} -> ${JSON.stringify(out)}`);
  if (isCy) {
    const changedCy = new Set(changed.map((r) => r[0]));
    const notTarget = changed.filter((r) => !targets.has(r[0])).length;
    const missing = [...targets.keys()].filter((t) => !changedCy.has(t)).length;
    const badValue = changed.filter((r) => targets.has(r[0]) && targets.get(r[0]) !== r[2]).length;
    console.log(`  сверка с миграцией 884: изменившихся вне списка ${notTarget}, целей без изменения ${missing}, расхождение ЗНАЧЕНИЯ ${badValue}`);
    for (const [id, a, out] of changed) {
      if (targets.has(id) && targets.get(id) !== out) console.log(`      VALUE ${id}: ждём ${JSON.stringify(targets.get(id))}, функция даёт ${JSON.stringify(out)}`);
    }
    mismatch = notTarget + missing + badValue;
  }
}

// --- B) статика: точки сборки адреса в сборщиках ---
// Разобранные исключения (не дырки): адрес уже прошёл санитайзер ВЫШЕ по коду,
// либо значение задано литералом/не может быть заглушкой-страной.
const WHITELIST = {
  'collect-bali.mjs:472': 'rowAddress собран выше через cardAddressBali (888)',
  'collect-theatres.mjs:841': 's.address — литерал словаря площадок (реальный адрес, не заглушка)',
  'collect-events.mjs:143': 'Ticketmaster: ev.venue = имя площадки, страны в поле не бывает',
};
const files = ['collect-cyprus.mjs', 'collect-bali.mjs', 'collect-tg.mjs', 'collect-theatres.mjs', 'collect-events.mjs'];
let points = 0;
let holes = 0;
for (const f of files) {
  const src = fs.readFileSync(new URL(`../../scripts/${f}`, import.meta.url), 'utf8').split('\n');
  const hits = [];
  src.forEach((line, i) => {
    if (!/^\s*address:\s*/.test(line)) return;
    if (/^\s*address:\s*'/.test(line)) return; // литерал словаря площадок — адрес задан руками
    points++;
    const ok = /cardAddress|cardAddressBali|cleanAddress/.test(line);
    const wl = WHITELIST[`${f}:${i + 1}`];
    if (!ok && !wl) { holes++; hits.push(`${i + 1}: ${line.trim().slice(0, 90)}`); }
  });
  console.log(`  ${f}: точек сборки адреса ${hits.length ? 'с дыркой ' + hits.length : 'закрыты (санитайзер/исключение)'}`);
  for (const h of hits) console.log(`      ${h}`);
}
console.log(`ИТОГО: точек сборки адреса ${points}, без санитайзера ${holes}`);
console.log(`ВЕРДИКТ: ${mismatch === 0 && holes === 0 ? 'OK — гейт зелёный' : 'ВНИМАНИЕ — расхождения ' + (mismatch + holes)}`);
