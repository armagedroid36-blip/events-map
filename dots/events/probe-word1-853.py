#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""probe-word1-853.py — офлайн-зонд по прод-снапшоту.
Класс, который зонды 822/833/836/849 НЕ смотрели: ОДНА точка площадки (<=150 м) + ОДНА дата,
разные нормализованные названия, РОВНО ОДНО общее значимое слово (длина >=5).
Прошлые зонды требовали >=2 общих слова, поэтому пары «исполнитель в названии на одном языке,
программа на другом» (общее слово — только имя собственное) выпадали.
Печатает пары + общее слово; вердикт выносится отдельно арбитром.
"""
import json, os, re, sys, unicodedata
from itertools import combinations
from datetime import datetime

SNAP = os.path.join(os.environ.get("LOCALAPPDATA", "."), "Temp", "prod-845.json")

STOP = set("""the and friday saturday sunday monday tuesday wednesday thursday 2026 2025 2027
live show concert concert party night festival event events 2026- international cyprus
nicosia limassol larnaca paphos paralimni protaras famagusta ayia napa bali ubud canggu
seminyak kuta sanur denpasar nusa dua jimbaran danang nha trang hoi an
christmas new year halloween live music stand comedy theatre theater
концерт вечер шоу фестиваль ночь вечеринка встреча праздник открытие
рождественский рождество новый год рождественская программа расписание
""".split())

def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = re.sub(r"[^\wа-яё\u0370-\u03ff]+", " ", s)
    return s

def words(t):
    out = set()
    for w in norm(t).split():
        if len(w) < 5:
            continue
        if w in STOP:
            continue
        if w.isdigit():
            continue
        out.add(w)
    return out

def names(c):
    return [x for x in (c.get("title"), c.get("title_ru"), c.get("title_en")) if x]

def load():
    with open(SNAP, encoding="utf-8") as f:
        d = json.load(f)
    return d.get("cards") or d.get("events") or []

def dist(a, b, c, d):
    return ((a - c) ** 2 + (b - d) ** 2) ** 0.5 * 111000  # м, грубо

def main():
    cards = load()
    live = [c for c in cards if c.get("start_date")]
    print(f"снапшот: {len(cards)} карточек, с датой {len(live)}")

    # группировка по дате
    bydate = {}
    for c in live:
        if c.get("recurrence"):
            continue
        lat, lng = c.get("lat"), c.get("lng")
        if lat is None or lng is None:
            continue
        bydate.setdefault(str(c["start_date"])[:10], []).append(c)

    pairs = []
    for date, group in bydate.items():
        for a, b in combinations(group, 2):
            if dist(a["lat"], a["lng"], b["lat"], b["lng"]) > 150:
                continue
            wa, wb = words(" ".join(names(a))), words(" ".join(names(b)))
            common = wa & wb
            if len(common) != 1:
                continue
            # разные названия
            if norm(names(a)[0]) == norm(names(b)[0]):
                continue
            # время: считаем смешанным, если задано у обеих и различается
            ta, tb = a.get("start_time"), b.get("start_time")
            tstate = "same" if (ta and tb and ta == tb) else ("mixed" if (ta and tb) else "one-empty")
            pairs.append({
                "date": date,
                "a": a.get("id"), "at": names(a)[0], "atime": ta, "acity": a.get("city"),
                "b": b.get("id"), "bt": names(b)[0], "btime": tb, "bcity": b.get("city"),
                "common": sorted(common), "t": tstate,
                "d": round(dist(a["lat"], a["lng"], b["lat"], b["lng"])),
                "addr_a": (a.get("address") or "")[:60],
                "addr_b": (b.get("address") or "")[:60],
            })

    same = [p for p in pairs if p["t"] == "same"]
    mixed = [p for p in pairs if p["t"] == "mixed"]
    one = [p for p in pairs if p["t"] == "one-empty"]
    print(f"пар с одним общим словом: {len(pairs)} (время совпадает {len(same)}, разное {len(mixed)}, у одной пусто {len(one)})")
    print()
    for tag, arr in (("ВРЕМЯ СОВПАДАЕТ", same), ("ВРЕМЯ РАЗНОЕ", mixed), ("У ОДНОЙ ПУСТО", one)):
        print(f"== {tag}: {len(arr)}")
        for p in sorted(arr, key=lambda x: x["date"]):
            print(f"  {p['date']} {p['common']} d={p['d']}м")
            print(f"    A {p['a'][:8]} {p['atime']} [{p['acity']}] {p['at']}")
            print(f"      адр: {p['addr_a']}")
            print(f"    B {p['b'][:8]} {p['btime']} [{p['bcity']}] {p['bt']}")
            print(f"      адр: {p['addr_b']}")
    with open(os.path.join(os.environ.get("LOCALAPPDATA", "."), "Temp", "leads-word1-853.json"), "w", encoding="utf-8") as f:
        json.dump(pairs, f, ensure_ascii=False, indent=1)
    print("\nлид-файл: %TEMP%\\leads-word1-853.json")

if __name__ == "__main__":
    main()
