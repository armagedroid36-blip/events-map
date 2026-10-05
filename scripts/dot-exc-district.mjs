import { districtOf, cityForPoint } from './cy-districts.mjs';
const pts = [['0342fad2',34.6824125,33.0259269],['a593accd',34.6813016,33.0438594],['eeb244ff',34.6813016,33.0438594],['ec507855',34.92102399,33.09486335],['be700101',34.4436235,34.09713227]];
for (const [id,lat,lng] of pts) console.log(id, lat, lng, '->', districtOf(lat,lng), '/', cityForPoint(lat,lng));
