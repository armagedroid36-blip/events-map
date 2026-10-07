// Разведка: что источник cyprusnow отдаёт в description для двух карточек с description == title.
import { writeFileSync } from 'node:fs';

const queries = ['chasing life', 'bachata'];
const out = [];
for (const q of queries) {
  const url = `https://cyprusnow.app/api/events?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const j = await res.json();
    const evs = (j.events || []).filter((e) => /chasing|bachata/i.test(String(e.title || '')));
    out.push({ q, status: res.status, total: (j.events || []).length, match: evs.map((e) => ({
      title: e.title,
      description: e.description,
      performer: e.performer,
      venue: e.venue && e.venue.name,
      city: e.venue && e.venue.city,
      start: e.start_date || e.startDate || e.date,
    })) });
  } catch (err) {
    out.push({ q, error: String(err.message || err) });
  }
}
console.log(JSON.stringify(out, null, 2));
writeFileSync(process.env.LOCALAPPDATA + '/Temp/cn_desc_title_probe.json', JSON.stringify(out, null, 2));
