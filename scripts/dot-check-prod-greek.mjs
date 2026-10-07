// Проверка ПРОДА после деплоя: новые адреса греческих карточек отдают перевод,
// прежние адреса живы и канонизируются на новый, в sitemap нет мусорных хвостов.
// Запуск: node scripts/dot-check-prod-greek.mjs
const SITE = 'https://mypins.site';
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const EV = {
  '35a39f42-9b93-43bb-b421-227aa02eaec5': {
    ru: '/event/35a39f42-9b93-43bb-b421-227aa02eaec5/fedon-ili-golovokruzhenie-mezhdunarodnyy-festival-nikosii-2026/',
    en: '/en/event/35a39f42-9b93-43bb-b421-227aa02eaec5/phaidon-or-o-iliggos-nicosia-international-festival-2026/',
    old: ['/event/35a39f42-9b93-43bb-b421-227aa02eaec5/event-35a39f42/', '/en/event/35a39f42-9b93-43bb-b421-227aa02eaec5/event-35a39f42/', '/event/35a39f42-9b93-43bb-b421-227aa02eaec5/2026/', '/en/event/35a39f42-9b93-43bb-b421-227aa02eaec5/2026/'],
  },
  'b43e579e-f217-45f2-88bd-cd580cfef0d7': {
    ru: '/event/b43e579e-f217-45f2-88bd-cd580cfef0d7/letnie-nochi-2026-nikosiya-napolnyaetsya-muzykoy-iskusstvom-i-zhiznyu-v-kazhdom-rayone/',
    en: '/en/event/b43e579e-f217-45f2-88bd-cd580cfef0d7/summer-nights-2026-nicosia-fills-with-music-art-and-life-in-every-neighborhood/',
    old: ['/event/b43e579e-f217-45f2-88bd-cd580cfef0d7/event-b43e579e/', '/en/event/b43e579e-f217-45f2-88bd-cd580cfef0d7/event-b43e579e/'],
  },
  'fd448831-7618-4584-add2-58068b4547df': {
    ru: '/event/fd448831-7618-4584-add2-58068b4547df/fedon-ili-golovokruzhenie-mezhdunarodnyy-festival-nikosii-2026/',
    en: '/en/event/fd448831-7618-4584-add2-58068b4547df/phaidon-or-o-iliggos-nicosia-international-festival-2026/',
    old: ['/event/fd448831-7618-4584-add2-58068b4547df/event-fd448831/', '/en/event/fd448831-7618-4584-add2-58068b4547df/event-fd448831/'],
  },
};

const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const fetchPage = async (path) => {
  const res = await fetch(`${SITE}${path}`, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  return { status: res.status, canonical, h1: h1.replace(/<[^>]*>/g, '').trim(), title: title.trim() };
};

let bad = 0;
for (const [id, v] of Object.entries(EV)) {
  console.log(`\n=== ${id.slice(0, 8)}`);
  for (const [lang, path] of [['RU', v.ru], ['EN', v.en]]) {
    const p = await fetchPage(path);
    const greek = GREEK.test(p.h1) || GREEK.test(p.title);
    const ok = p.status === 200 && p.canonical === `${SITE}${path}` && !greek;
    if (!ok) bad += 1;
    console.log(`  [${ok ? 'OK ' : 'ПЛОХО'}] ${lang} ${p.status} canonical=${p.canonical === `${SITE}${path}` ? 'self' : p.canonical} greek=${greek}`);
    console.log(`         h1: ${p.h1.slice(0, 80)}`);
  }
  for (const path of v.old) {
    const p = await fetchPage(path);
    const target = path.startsWith('/en/') ? `${SITE}${v.en}` : `${SITE}${v.ru}`;
    const greek = GREEK.test(p.h1);
    const ok = p.status === 200 && p.canonical === target && !greek;
    if (!ok) bad += 1;
    console.log(`  [${ok ? 'OK ' : 'ПЛОХО'}] алиас ${path.replace(id, '').slice(0, 40)} → ${p.status} canonical=${p.canonical === target ? 'на новый URL' : p.canonical} greek=${greek}`);
  }
}

const sm = await (await fetch(`${SITE}/sitemap.xml`)).text();
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const junk = locs.filter((u) => /\/(event|20\d\d)\/$/.test(u) || /\/event-\w{8}\/$/.test(u));
console.log(`\nSitemap: ${locs.length} URL, мусорных хвостов (event/20xx/event-xxxxxxxx): ${junk.length}`);
for (const j of junk.slice(0, 10)) console.log(`  ! ${j}`);
if (junk.length) bad += junk.length;
console.log(`\nИтог: проблем ${bad}`);
