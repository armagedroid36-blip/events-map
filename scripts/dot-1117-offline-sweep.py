#!/usr/bin/env python
"""Офлайн-свип датовых инвариантов по прод-снимку (0 запросов к Supabase).

Три класса, замеренные впервые в запуске 1117:
  A) карточка вне географической зоны своего города (Бали/Нячанг/Дананг/Кипр);
  B) время в НАЗВАНИИ не совпадает с start_time (сенсор: только карточки,
     у которых время есть в названии; сейчас таких 8 — кросс-проверка 8/8);
  C) пин карточки Бали далеко от центра своего района (порог 15 км) и
     «метка района хуже ближайшего чужого центра в 3 раза» (шумовая ветка:
     центры районов — точки городков, а не полигоны, поэтому кандидаты
     разбираются по адресу, а не пачкой).

Запуск: python scripts/dot-1117-offline-sweep.py
Питфол: снимок всегда тянуть с ?v=<epoch>, иначе CDN отдаёт старый (max-age=600).
"""
import json, math, os, re, sys, time, urllib.request

SNAP = "https://mypins.site/data/events.json?v=%d"
ZONES = {
    "Bali":     (-9.30, -7.90, 114.30, 116.00),
    "Nyachang": (11.85, 12.55, 108.85, 109.50),
    "Danang":   (15.85, 16.35, 107.80, 108.45),
    "Cyprus":   (34.45, 35.90, 32.10, 34.75),
}
TIME = re.compile(r"(?<![\d:.,])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d:.,])")
MONEY = re.compile(r"(цена|price|€|\$|руб|min|мин|км|kg|%|tel|тел)", re.I)


def load():
    req = urllib.request.Request(SNAP % int(time.time()), headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=40).read().decode())
    return d, d.get("cards") or []


def zone_of(city):
    c = (city or "").lower()
    if "bali" in c or "бали" in c:
        return "Bali"
    if "нячанг" in c or "nha trang" in c:
        return "Nyachang"
    if "дананг" in c or "da nang" in c or "danang" in c:
        return "Danang"
    if "кипр" in c or "cyprus" in c:
        return "Cyprus"
    return None


def hm(s):
    m = re.match(r"^(\d{1,2}):(\d{2})", s or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


def km(a, b, c, e):
    return math.hypot((a - c) * 111.0, (b - e) * 111.0 * math.cos(math.radians(a)))


def centers():
    p = os.path.join(os.environ.get("LOCALAPPDATA", "/tmp"), "Temp", "bali_centers.json")
    if os.path.exists(p):
        return json.load(open(p))
    return {}


def main():
    d, cards = load()
    print("снимок generated_at %s, count %d" % (d.get("generated_at"), len(cards)))

    # A — вне зоны своего города
    out, unk = [], []
    for c in cards:
        if c.get("lat") is None or c.get("lng") is None:
            continue
        z = zone_of(c.get("city"))
        if z is None:
            unk.append((c["id"][:8], c.get("city")))
            continue
        y0, y1, x0, x1 = ZONES[z]
        if not (y0 <= c["lat"] <= y1 and x0 <= c["lng"] <= x1):
            out.append((c["id"][:8], z, c.get("city"), (c.get("title") or "")[:45], c["lat"], c["lng"]))
    print("A) вне зоны города: %d | city не распознан: %d %s" % (len(out), len(unk), unk[:5]))
    for o in out:
        print("   OUT", o)

    # B — время в названии vs start_time
    with_t = hit = 0
    cand = []
    for c in cards:
        st = hm(c.get("start_time"))
        ts = []
        for f in ("title", "title_ru", "title_en"):
            v = c.get(f)
            if v and not MONEY.search(v):
                ts += [(int(a), int(b)) for a, b in TIME.findall(v)]
        if not (st and ts):
            continue
        with_t += 1
        if min(abs((a[0] * 60 + a[1]) - (st[0] * 60 + st[1])) for a in ts) > 15:
            cand.append((c["id"][:8], c.get("start_time"), ts, (c.get("title") or "")[:50], c.get("city")))
    print("B) сенсор: карточек со временем в названии %d, расхождений %d" % (with_t, len(cand)))
    for x in cand:
        print("   TIME", x)

    # C — Бали: расстояние до центра своего района
    cent = centers()
    if not cent:
        print("C) пропущено: нет %TEMP%/bali_centers.json (снять через scripts/bali-districts.mjs)")
        return
    far, ratio, bali = [], [], 0
    for c in cards:
        city = (c.get("city") or "").lower()
        if "bali" not in city and "бали" not in city:
            continue
        bali += 1
        key = city.split(",")[0].strip()
        own = cent.get(key)
        if not own:
            continue
        do = km(c["lat"], c["lng"], own["lat"], own["lng"])
        if do > 15:
            far.append((round(do, 1), c["id"][:8], key, (c.get("address") or "")[:35]))
        best = min(((km(c["lat"], c["lng"], v["lat"], v["lng"]), k)
                    for k, v in cent.items() if k != key), default=(999, None))
        if best[0] < do / 3 and best[0] < 8:
            ratio.append((c["id"][:8], key, round(do, 1), best[1], round(best[0], 1)))
    print("C) Бали карточек %d | пин >15 км от своего центра: %d | хуже чужого в 3 раза: %d"
          % (bali, len(far), len(ratio)))
    for x in far:
        print("   FAR", x)


if __name__ == "__main__":
    main()
