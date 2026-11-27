"""Зонд класса «дата в названии не совпадает со start_date» по прод-снимку (без базы).
Снимок: mypins.site/data/events.json (cache-buster)."""
import json, re, sys, time, urllib.request

TODAY = "2026-11-27"
URL = "https://mypins.site/data/events.json?v=%d" % int(time.time())

req = urllib.request.Request(URL, headers={"User-Agent": "hermes-dot-events/1.0", "Cache-Control": "no-cache"})
data = json.load(urllib.request.urlopen(req, timeout=60))
cards = data.get("cards") or data.get("events") or []
print("generated_at", data.get("generated_at"), "count", len(cards))

MONTHS_RU = {"январ":1,"феврал":2,"март":3,"апрел":4,"ма":5,"июн":6,"июл":7,"август":8,"сентябр":9,"октябр":10,"ноябр":11,"декабр":12}

def title_of(c):
    return " | ".join(x for x in (c.get("title"), c.get("title_ru"), c.get("title_en")) if x)

# dd.mm(.yyyy) / dd/mm
pat_dm = re.compile(r"(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)")
pat_iso = re.compile(r"(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)")
pat_year = re.compile(r"(?<!\d)(20\d{2})(?!\d)")

rows = []
for c in cards:
    sd = (c.get("start_date") or "")[:10]
    if not sd:
        continue
    t = title_of(c)
    if not t:
        continue
    hits = []
    for m in pat_dm.finditer(t):
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        if not (1 <= d <= 31 and 1 <= mo <= 12):
            continue
        year = sd[:4]
        if y:
            year = ("20" + y) if len(y) == 2 else y
            if year != sd[:4]:
                # год в названии прошлый/будущий — отдельный класс, отмечаем отдельно
                hits.append(("year-diff", m.group(0), "%04d-%02d-%02d" % (int(year), mo, d)))
                continue
        try:
            cand = "%s-%02d-%02d" % (year, mo, d)
        except Exception:
            continue
        hits.append(("dm", m.group(0), cand))
    for m in pat_iso.finditer(t):
        hits.append(("iso", m.group(0), m.group(0)))
    ed = (c.get("end_date") or "")[:10]
    # дата из названия законна, если совпадает с началом ИЛИ концом интервала (тур/забег/чемпионат)
    ok_dates = {d for d in (sd, ed) if d}
    bad = [h for h in hits if h[2] not in ok_dates]
    if bad:
        rows.append((c.get("id","")[:8], sd, ed, (c.get("start_time") or "")[:5], (c.get("city") or ""), t[:100], bad[:4]))

print("карточек с датой в названии != start_date:", len(rows))
for r in rows:
    print(" | ".join(str(x) for x in r))
