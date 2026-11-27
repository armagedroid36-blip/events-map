#!/usr/bin/env python3
"""Точка «События», run 1109. Офлайн-класс (402): «дубль-перевод без общих слов».

Пробел предыдущих зондов: near-dupe (1099) и cross-source (скилл) требуют >=2 общих
содержательных слова в названиях, поэтому пары «Одно событие на русском» ↔ «Same event
in English» при точном совпадении даты, времени и площадки ими НЕ видны.

Зонд ищет пары: та же start_date, то же start_time, точки <=150 м, общих содержательных
слов 0 или 1, при этом письменности названий разные (кириллица vs латиница/греческая).
0 запросов к базе — читает прод-снимок data/events.json (?v=epoch).
"""
import json, math, re, sys, time, urllib.request

BASE = "https://mypins.site/data/events.json"
CYR = re.compile(r"[а-яё]", re.I)
LAT = re.compile(r"[a-z]", re.I)
GRK = re.compile(r"[α-ωά-ώ]", re.I)
STOP = set("""
и в во на с со к ко о об от до по за из у для не без при the a an of in on at to for with and
the this that party show night live music concert festival workshop class yoga tour day
event events день ночь вечер концерт шоу вечеринка праздник фестиваль мастер класс йога тур
выставка лекция спектакль балет встреча вечер вечеринки kids family christmas new year
рождество рождественский новый год 2025 2026 2027
""".split())


def load():
    url = f"{BASE}?v={int(time.time())}"
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "hermes-dot-events/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def words(*titles):
    out = set()
    for t in titles:
        if not t:
            continue
        for w in re.split(r"[^0-9a-zа-яё\u0370-\u03ff]+", str(t).lower()):
            if len(w) >= 4 and w not in STOP and not w.isdigit():
                out.add(w)
    return out


def script(t):
    t = t or ""
    if CYR.search(t):
        return "cyr"
    if GRK.search(t):
        return "grk"
    if LAT.search(t):
        return "lat"
    return "?"


def dist(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def main():
    data = load()
    cards = data.get("cards") or data.get("events") or []
    print(f"снимок generated_at={data.get('generated_at')} count={len(cards)}")
    by = {}
    n_geo = 0
    for c in cards:
        lat, lng = c.get("lat"), c.get("lng")
        if lat is None or lng is None:
            continue
        try:
            lat, lng = float(lat), float(lng)
        except Exception:
            continue
        n_geo += 1
        key = (c.get("start_date"), c.get("start_time") or "")
        by.setdefault(key, []).append((c, lat, lng))

    pairs = []
    for key, items in by.items():
        if len(items) < 2:
            continue
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                c1, la1, lo1 = items[i]
                c2, la2, lo2 = items[j]
                d = dist((la1, lo1), (la2, lo2))
                if d > 0.15:
                    continue
                w1 = words(c1.get("title"), c1.get("title_ru"), c1.get("title_en"))
                w2 = words(c2.get("title"), c2.get("title_ru"), c2.get("title_en"))
                common = w1 & w2
                small = min(len(w1), len(w2))
                if small == 0:
                    continue
                # интерес: почти нет общих слов, но названия на разных письменностях
                if len(common) >= 2:
                    continue
                s1 = script(c1.get("title") or c1.get("title_ru"))
                s2 = script(c2.get("title") or c2.get("title_ru"))
                # шум: две кириллические карточки в одной точке — разные события города на центроидном пине
                if s1 == s2:
                    continue
                pairs.append((round(d * 1000), key, common, s1, s2, c1, c2))

    print(f"гео-карточек {n_geo}, групп (дата+время) {len(by)}")
    pairs.sort(key=lambda p: (p[1][0] or "", p[0]))
    print(f"КАНДИДАТОВ «перевод без общих слов»: {len(pairs)}")
    for d, key, common, s1, s2, c1, c2 in pairs:
        print(f"- {key[0]} {key[1]} | {d} м | общих={sorted(common)} | {s1}/{s2}")
        print(f"    A {str(c1.get('id'))[:8]} {(c1.get('title') or '')[:70]!r} city={c1.get('city')!r}")
        print(f"    B {str(c2.get('id'))[:8]} {(c2.get('title') or '')[:70]!r} city={c2.get('city')!r}")


if __name__ == "__main__":
    main()
