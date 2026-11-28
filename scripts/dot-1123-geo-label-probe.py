#!/usr/bin/env python3
"""Офлайн-зонд класса «метка города не даёт фильтра» по прод-снимку (0 запросов к базе).

A) Бали: карточки с пином на острове или меткой «…Bali» — сколько из них несут РАЙОН
   (канон «Кута / Убуд / Чангу …»), а сколько только «Бали/Bali, Индонезия»: у второй
   группы фильтр по городу на карте их не находит (миссия — «район как фильтр»).
B) Карточки вне геофокуса (не Кипр, не Бали, не Дананг/Нячанг) — мусор на карте.
C) Контроль сенсора: синтетические карточки, 4 обязаны попасть в класс, 3 — нет.

Запуск: python scripts/dot-1123-geo-label-probe.py
"""
import json
import re
import time
import urllib.request
from collections import Counter

SNAP_URL = "https://mypins.site/data/events.json"
UA = "hermes-dot-events/1.0"

BALI_BBOX = (-9.05, 114.35, -8.00, 115.80)  # lat_min, lng_min, lat_max, lng_max
GENERIC_BALI = re.compile(r"^(bali|бали)(\s*,\s*(indonesia|индонезия))?$", re.I)
CYPRUS = re.compile(r"кипр|cyprus", re.I)
VN = re.compile(r"дананг|da nang|нячанг|nha trang|hoi an|хой ан", re.I)


def load_snapshot():
    url = "%s?v=%d" % (SNAP_URL, int(time.time()))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def on_bali(c):
    city = c.get("city") or ""
    if "bali" in city.lower() or "бали" in city.lower():
        return True
    lat, lng = c.get("lat"), c.get("lng")
    if lat is None or lng is None:
        return False
    return BALI_BBOX[0] <= lat <= BALI_BBOX[2] and BALI_BBOX[1] <= lng <= BALI_BBOX[3]


def is_generic_bali(c):
    """Метка не называет РАЙОН (пусто или только «Бали/Bali, Индонезия»)."""
    city = (c.get("city") or "").strip()
    return city == "" or bool(GENERIC_BALI.match(city))


def focus(c):
    city = c.get("city") or ""
    if CYPRUS.search(city) or VN.search(city):
        return "cyprus-vn"
    if on_bali(c):
        return "bali"
    return "out"


def selftest():
    cases = [
        ({"id": "s1", "city": "Бали, Индонезия", "lat": -8.5, "lng": 115.1}, True),
        ({"id": "s2", "city": "Bali, Indonesia", "lat": -8.7, "lng": 115.2}, True),
        ({"id": "s3", "city": "", "lat": -8.65, "lng": 115.13}, True),
        ({"id": "s4", "city": "Убуд, Bali", "lat": -8.51, "lng": 115.26}, False),
        ({"id": "s5", "city": "Чангу, Бали", "lat": -8.65, "lng": 115.13}, False),
        ({"id": "s6", "city": "Джакарта, Индонезия", "lat": -6.2, "lng": 106.8}, False),
        ({"id": "s7", "city": "Лимасол, Кипр", "lat": 34.7, "lng": 33.0}, False),
    ]
    ok = sum(1 for c, want in cases if is_generic_bali(c) == want)
    print("КОНТРОЛЬ СЕНСОРА: %d/%d" % (ok, len(cases)))
    return ok == len(cases)


def main():
    selftest()
    snap = load_snapshot()
    cards = snap.get("cards") or []
    print("СНИМОК: generated_at %s, карточек %d" % (snap.get("generated_at"), len(cards)))

    bali = [c for c in cards if on_bali(c)]
    labels = Counter((c.get("city") or "—") for c in bali)
    generic = [c for c in bali if is_generic_bali(c)]
    print("\nA) Бали: карточек %d, различных меток %d" % (len(bali), len(labels)))
    for city, n in labels.most_common(6):
        print("   %-24s %d" % (city[:24], n))
    print("   БЕЗ РАЙОНА (только «Бали»): %d" % len(generic))
    for c in generic[:10]:
        print("     %s %-40s %s %s" % (c["id"][:8], (c.get("title") or "")[:40],
                                       c.get("start_date"), c.get("city")))

    out = [c for c in cards if focus(c) == "out"]
    print("\nB) Вне геофокуса: %d" % len(out))
    for c in out[:10]:
        print("     %s %-36s %-22s %s" % (c["id"][:8], (c.get("title") or "")[:36],
                                          (c.get("city") or "?")[:22], c.get("start_date")))

    # C) метка и пин в РАЗНЫХ странах: у страны своя рамка
    boxes = {
        "Кипр": ((34.40, 32.00, 35.80, 34.75), CYPRUS),
        "Вьетнам": ((8.00, 102.00, 23.60, 110.00), VN),
        "Бали": (BALI_BBOX, None),
    }
    bad = []
    for c in cards:
        city = c.get("city") or ""
        lat, lng = c.get("lat"), c.get("lng")
        if lat is None or lng is None:
            continue
        for name, (box, rx) in boxes.items():
            if name == "Бали":
                hit = on_bali(c)
            else:
                hit = bool(rx.search(city))
            if not hit:
                continue
            inside = box[0] <= lat <= box[2] and box[1] <= lng <= box[3]
            if not inside:
                bad.append((c, name, lat, lng))
            break
    print("\nC) Метка и пин в разных странах: %d" % len(bad))
    for c, name, lat, lng in bad[:10]:
        print("     %s %-30s метка=%-20s пин=%.4f,%.4f (%s)" % (
            c["id"][:8], (c.get("title") or "")[:30], name, lat, lng, (c.get("city") or "")[:20]))


if __name__ == "__main__":
    main()
