import { cleanCardText, decodeHtmlEntities } from './text-safe.mjs';
const cases = [
  ['Lady&#8217;s Mile Beach, Limassol', 'Lady’s Mile Beach, Limassol'],
  ['A &amp; B &#x41; &#65;', 'A & B A A'],
  ['Pangolin Creative Workshop:  Slime', 'Pangolin Creative Workshop: Slime'],
  ['Jl. Labuansait No.54, Pecatu', 'Jl. Labuansait No.54, Pecatu'],
  ['Nicosia, Cyprus', 'Nicosia, Cyprus'],
  ['AT&T Park &lt;3', 'AT&T Park <3'],
];
let ok = 0;
for (const [inp, want] of cases) {
  const got = cleanCardText(inp);
  if (got === want) ok++;
  else console.log('FAIL', JSON.stringify(inp), '->', JSON.stringify(got), 'want', JSON.stringify(want));
}
console.log(`cleanCardText: ${ok}/${cases.length}`);
