// Сборка упрощённых полигонов округов Кипра (Nominatim GeoJSON из %LOCALAPPDATA%\Temp)
// в компактный модуль scripts/data/cy-districts.json для оффлайн point-in-polygon.
// Запуск: node scripts/dot-cy-districts-build.mjs
import fs from 'node:fs';
import path from 'node:path';

const T = process.env.LOCALAPPDATA + '\\Temp';
const FILES = {
  'Никосия': 'nom_Nicosia+District.json',
  'Лимасол': 'nom_Limassol+District.json',
  'Ларнака': 'nom_Larnaca.json',
  'Пафос': 'nom_Paphos.json',
  'Фамагуста': 'nom_Famagusta.json',
};
const TOL = 0.0015; // ~150 м

// Дугласа-Пекер, метрика в градусах (Кипр < 0.7° по широте — искажение несущественно)
function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len;
}
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  const left = simplify(pts.slice(0, idx + 1), tol);
  const right = simplify(pts.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}

const out = { generated: new Date().toISOString(), tol: TOL, districts: [] };
for (const [name, file] of Object.entries(FILES)) {
  const p = path.join(T, file);
  const gj = JSON.parse(fs.readFileSync(p, 'utf8'));
  const feat = Array.isArray(gj.features) ? gj.features[0] : gj;
  const geom = feat.geometry || feat;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const rings = [];
  for (const poly of polys) {
    const outer = poly[0];
    const s = simplify(outer, TOL);
    if (s.length >= 4 && Math.abs(ringArea(s)) > 1e-5) rings.push(s.map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)]));
  }
  const pts = rings.reduce((n, r) => n + r.length, 0);
  out.districts.push({ name, rings });
  console.log(`${name}: полигонов ${polys.length}, колец ${rings.length}, точек ${outer0(polys)} -> ${pts}`);
}
function outer0(polys) { return polys.reduce((n, p) => n + p[0].length, 0); }
function ringArea(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

const dst = path.resolve('scripts/data/cy-districts.json');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify(out));
console.log('Записано:', dst, (fs.statSync(dst).size / 1024).toFixed(1), 'КБ');
