// Проба: обратный геокодер Nominatim по координатам 6 вылеченных карточек —
// какой округ (district) у точки. Проверяем, какой город канонический.
const IDS = [
  ['22f4448c', 'Nikitari', 35.0722348, 32.9936092],
  ['3845e750', 'Pano Lefkara', 34.8665517, 33.3068524],
  ['dbb4cbec', 'Omodos', 34.8480909, 32.8078054],
  ['b2cc4009', 'Palaichori', 34.9216662, 33.093896],
  ['55f102fe', 'Palaichori', 34.9216662, 33.093896],
  ['4116c490', 'Coral Bay', 34.8537937, 32.3699315],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [id, name, lat, lng] of IDS) {
  const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat}&lon=${lng}`;
  try {
    const resp = await fetch(u, { headers: { 'user-agent': 'events-map-dot/1.0 (armagedroid@yandex.ru)' }, signal: AbortSignal.timeout(15000) });
    const j = await resp.json();
    const a = j.address || {};
    console.log(id, name, '|', j.display_name?.slice(0, 90));
    console.log('   village/town:', a.village || a.town || a.city || '-', '| municipality:', a.municipality || '-', '| county:', a.county || '-', '| state_district:', a.state_district || '-', '| state:', a.state || '-');
  } catch (e) { console.log(id, 'ошибка', String(e).slice(0, 80)); }
  await sleep(1500);
}
