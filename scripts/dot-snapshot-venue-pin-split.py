#!/usr/bin/env python3
"""Класс «одна площадка (адрес) — ДВА разных пина» по прод-снимку.

0 запросов к базе: читает mypins.site/data/events.json (?v=epoch).
Группирует живые карточки по подписи адреса: токены >=5 символов без номеров,
без типовых слов (gallery/hotel/theatre/street/square/...), без названия города.
Внутри группы (тот же city) ищет пары с расстоянием пинов > 1.5 км — это либо
одна площадка с разъехавшимися пинами (дефект), либо два разных объекта с
похожим адресом (шум; печатается для ручного арбитража).
"""
import json, math, re, sys, urllib.request, time

SNAP = sys.argv[1] if len(sys.argv) > 1 else None
MIN_KM = 1.5
MAX_KM = 45.0

GENERIC = {
    "street", "avenue", "road", "square", "street,", "jalan", "jl.", "jl", "no.",
    "gallery", "hotel", "theatre", "theater", "club", "bar", "restaurant", "cafe",
    "beach", "park", "mall", "resort", "villa", "house", "center", "centre",
    "cyprus", "bali", "vietnam", "кипр", "бали", "вьетнам", "улица", "ул.",
    "площадь", "проспект", "просп.", "ресторан", "отель", "клуб", "парк",
    "district", "regency", "municipality", "north", "south", "east", "west",
}


def load():
    if SNAP:
        return json.load(open(SNAP, encoding="utf-8"))
    url = "https://mypins.site/data/events.json?v=%d" % int(time.time())
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def haversine(a, b):
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


CITY_WORDS = set()


def city_words(cards):
    """Все слова из поля city (все языки) — токены города в адресе не подпись."""
    for c in cards:
        for w in re.findall(r"[a-zа-яё\u0370-\u03ff]{3,}", (c.get("city") or "").lower()):
            CITY_WORDS.add(w)


def sig(address, city):
    if not address:
        return None
    low = address.lower()
    toks = re.findall(r"[a-zа-яё\u0370-\u03ff]{5,}", low)
    out = set()
    for t in toks:
        if t in GENERIC or t in CITY_WORDS:
            continue
        out.add(t)
    if not out:
        return None
    # одиночный короткий токен — шум (названия улиц повторяются), подпись = 2+ слова
    return frozenset(sorted(out)[:3]) if len(out) >= 2 else None


def main():
    data = load()
    cards = data.get("cards") or data.get("events") or []
    city_words(cards)
    groups = {}
    for c in cards:
        s = sig(c.get("address"), c.get("city"))
        if not s or c.get("lat") is None or c.get("lng") is None:
            continue
        key = (c.get("city"), s)
        groups.setdefault(key, []).append(c)

    pairs = []
    for (city, s), rows in groups.items():
        if len(rows) < 2:
            continue
        rows = sorted(rows, key=lambda r: (r["lat"], r["lng"]))
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                d = haversine((rows[i]["lat"], rows[i]["lng"]), (rows[j]["lat"], rows[j]["lng"]))
                if MIN_KM < d < MAX_KM:
                    pairs.append((d, city, sorted(s), rows[i], rows[j]))

    # дедуп по паре id
    seen, uniq = set(), []
    for p in sorted(pairs, key=lambda x: -x[0]):
        k = tuple(sorted([p[3]["id"][:8], p[4]["id"][:8]]))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)

    print("снимок:", data.get("generated_at"), "карточек:", len(cards), "групп по адресу:", len(groups))
    print("пар «одна подпись адреса — пины дальше %.1f км»: %d" % (MIN_KM, len(uniq)))
    for d, city, toks, a, b in uniq:
        print("  %.1f км | %s | %s" % (d, city, ",".join(toks)))
        for r in (a, b):
            print("     %s | %s | %s | %s %s | %.5f,%.5f" % (
                r["id"][:8], r.get("start_date"), (r.get("title_ru") or r.get("title") or "")[:60],
                r.get("address", "")[:60], r.get("start_time") or "", r["lat"], r["lng"]))


if __name__ == "__main__":
    main()
