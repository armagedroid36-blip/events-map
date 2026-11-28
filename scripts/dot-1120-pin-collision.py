#!/usr/bin/env python3
"""dot 1120: пин-коллизии в прод-снимке (0 запросов к базе).

Класс: разные площадки получают ОДНУ И ТУ ЖЕ точку => пин не площадочный,
а фолбэк/центроид. Классы, покрытые ранее (поименно): пины на центровых
константах искались только ВНУТРИ пар одинаковой подписи адреса (1103),
near-dupe по гео (1099-1101), зоны городов (1117). Здесь обратный срез:

 A) «одна точка, разные города» — точка встречается у карточек 2+ разных city
    (значит как минимум одна карточка стоит на чужой константе);
 B) «одна точка, 3+ разных адреса в одном городе» — кандидат в фолбэк-центроид;
 C) «медианный пин города у карточки с адресом, который называет площадку» —
    сколько карточек сидит на самой частой точке своего города.

Контроль сенсора: если ни одной коллизии не найдено — печатать это как
результат класса, но только при ненулевом числе городов и точек (иначе
«0» означает, что снимок не прочитан).
"""
import json, re, sys, time, urllib.request
from collections import Counter, defaultdict

URL = "https://mypins.site/data/events.json?v=%d" % int(time.time())
CITY_WORDS = {
    "bali", "кипр", "cyprus", "вьетнам", "vietnam", "индонезия", "indonesia",
    "дананг", "da nang", "нячанг", "nha trang", "лимасол", "limassol",
    "никосия", "nicosia", "ларнака", "larnaca", "пафос", "paphos",
    "фамагуста", "famagusta", "протарас", "protaras", "паралимни", "paralimni",
    "ая-напа", "ayia napa", "убуд", "ubud", "чангу", "canggu", "кута", "kuta",
    "семиньяк", "seminyak", "санур", "sanur", "денпасар", "denpasar",
    "джимбаран", "jimbaran", "легиан", "legian", "беноа", "benoa",
    "печату", "pecatu", "табанан", "tabanan", "керобокан", "kerobokan",
}


def norm_addr(a):
    if not a:
        return None
    s = re.sub(r"[^0-9a-zа-яё\u0370-\u03ff ]+", " ", str(a).lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def key(addr):
    """подпись адреса без слов города/страны и без номеров домов"""
    if not addr:
        return None
    toks = [t for t in addr.split() if len(t) >= 4 and not t.isdigit()]
    toks = [t for t in toks if t not in CITY_WORDS]
    return " ".join(sorted(set(toks))[:3]) or None


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "hermes-dot-events/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    cards = data.get("cards") or []
    gen = data.get("generated_at")
    print("снимок: generated_at=%s карточек=%d" % (gen, len(cards)))
    if not cards:
        print("ПУСТО: снимок не содержит карточек — замер недействителен")
        return 1

    geo = [c for c in cards if c.get("lat") is not None and c.get("lng") is not None]
    print("с гео: %d, городов: %d, уникальных точек: %d"
          % (len(geo), len({c.get("city") for c in geo}),
             len({(round(float(c["lat"]), 4), round(float(c["lng"]), 4)) for c in geo})))

    # A: точка у разных городов
    by_pt = defaultdict(list)
    for c in geo:
        by_pt[(round(float(c["lat"]), 4), round(float(c["lng"]), 4))].append(c)
    cross = []
    for pt, cs in by_pt.items():
        cities = {c.get("city") for c in cs}
        if len(cities) > 1:
            cross.append((pt, cities, cs))
    print("\nA) точек с 2+ городами: %d" % len(cross))
    for pt, cities, cs in sorted(cross, key=lambda x: -len(x[2]))[:8]:
        print("   %s %s -> %s" % (pt, sorted(cities),
                                  [(c["id"][:8], (c.get("city") or "")[:18],
                                    (c.get("title") or "")[:34]) for c in cs]))

    # B: одна точка, 3+ разных подписи адреса внутри одного города
    col = []
    for pt, cs in by_pt.items():
        per_city = defaultdict(set)
        for c in cs:
            k = key(norm_addr(c.get("address")))
            if k:
                per_city[c.get("city")].add(k)
        for city, ks in per_city.items():
            if len(ks) >= 3:
                col.append((pt, city, ks, [c for c in cs if c.get("city") == city]))
    col.sort(key=lambda x: -len(x[3]))
    print("\nB) точек с 3+ разными адресами в одном городе: %d" % len(col))
    for pt, city, ks, cs in col[:8]:
        print("   %s %s адресов=%d карточек=%d %s" % (pt, city, len(ks), len(cs),
                                                      [(c["id"][:8], (c.get("title") or "")[:28]) for c in cs[:4]]))

    # C: самая частая точка города
    print("\nC) самая частая точка своего города (фолбэк-подозрение):")
    by_city = defaultdict(list)
    for c in geo:
        by_city[c.get("city")].append(c)
    tot = 0
    for city, cs in sorted(by_city.items(), key=lambda x: -len(x[1]))[:8]:
        cnt = Counter((round(float(c["lat"]), 4), round(float(c["lng"]), 4)) for c in cs)
        pt, n = cnt.most_common(1)[0]
        tot += n
        print("   %-18s всего %3d, топ-точка %s ×%d" % ((city or "?")[:18], len(cs), pt, n))
    print("   суммарно на топ-точках городов: %d из %d" % (tot, len(geo)))

    print("\nИТОГ: A=%d B=%d" % (len(cross), len(col)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
