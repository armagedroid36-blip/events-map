#!/usr/bin/env python3
"""Часовой свип инвариантов по ПРОД-СНИМКУ, а не по базе.

Зачем: агентские зонды каждый час читали active-срез Supabase пагинацией
(1430 строк x N запросов), и egress упирался в квоту тарифа (26.11.2026:
402 exceed_egress_quota). Всё, что нужно для проверки «нет ли дефектов в
живых карточках», уже лежит в снимке витрины https://mypins.site/data/events.json.

Правило: свип инвариантов — по снимку; база нужна только для ЗАПИСИ
(PATCH) и для того, чего в снимке нет: photos, website, description, auto_review.

Снимок тянуть с cache-buster (?v=<epoch>): CDN отдаёт кэш max-age=600,
без него легко получить вчерашний снимок (питфол 1091).

Запуск: python scripts/dot-snapshot-sweep.py [--past-check]
"""
import json
import os
import sys
import time
import urllib.request
from collections import defaultdict

SNAP_URL = "https://mypins.site/data/events.json"
UA = "hermes-dot-events/1.0"


def load_snapshot():
    url = f"{SNAP_URL}?v={int(time.time())}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def cards_of(snap):
    for key in ("cards", "events", "data"):
        v = snap.get(key)
        if isinstance(v, list):
            return v
    raise SystemExit("в снимке нет массива карточек")


def has_recurrence(c):
    rec = c.get("recurrence")
    return isinstance(rec, dict) and bool(rec)


def minutes(t):
    """'HH:MM[:SS]' -> минуты суток."""
    if not t:
        return None
    p = str(t).split(":")
    try:
        return int(p[0]) * 60 + (int(p[1]) if len(p) > 1 else 0)
    except (ValueError, IndexError):
        return None


def night_ok(st, et):
    """Окончание раньше начала законно при ночном переходе (клуб/вечер)."""
    return st is not None and et is not None and (et <= 360 or (st >= 1320 and et <= 720))


def sweep(snap, past_check=False):
    cards = cards_of(snap)
    no_geo, no_city, eq_time, bad_end = [], [], [], []
    for c in cards:
        if c.get("lat") is None or c.get("lng") is None:
            # снимок может отдавать lat/lng под другими именами
            if c.get("latitude") is None or c.get("longitude") is None:
                no_geo.append(c)
        if not c.get("city"):
            no_city.append(c)
        st, et = minutes(c.get("start_time")), minutes(c.get("end_time"))
        if st is not None and et is not None:
            if st == et:
                eq_time.append(c)
            elif et < st and not night_ok(st, et):
                bad_end.append(c)

    def aliases(c):
        s = set()
        for k in ("title", "title_ru", "title_en"):
            v = c.get(k)
            if v:
                s.add(str(v).strip().casefold())
        return s

    groups = defaultdict(list)
    by_key = defaultdict(list)
    for c in cards:
        key = (str(c.get("start_date") or ""), str(c.get("city") or ""))
        by_key[key].append(c)
        for a in aliases(c):
            groups[(a,) + key].append(c)

    dupe_groups = {k: v for k, v in groups.items() if len({id(x) for x in v}) > 1}
    dupe_ids = {id(x) for v in dupe_groups.values() for x in v}
    # «одно название + дата, разные города»
    by_title_date = defaultdict(set)
    for c in cards:
        d = str(c.get("start_date") or "")
        for a in aliases(c):
            by_title_date[(a, d)].add(str(c.get("city") or ""))
    cross_city = {k: v for k, v in by_title_date.items() if len(v) > 1}

    past = []
    if past_check:
        today = str(snap.get("generated_at") or "")[:10]
        for c in cards:
            sd, ed = str(c.get("start_date") or ""), str(c.get("end_date") or "")
            if sd and today and sd < today and not has_recurrence(c) and (not ed or ed < today):
                past.append(c)

    print(f"снимок generated_at {snap.get('generated_at')} count {len(cards)}")
    print(f"без гео {len(no_geo)} | без city {len(no_city)} | start_time==end_time {len(eq_time)}"
          f" | окончание раньше начала без ночного перехода {len(bad_end)}")
    print(f"групп дублей title|start_date|city (с алиасами) {len(dupe_groups)} (карточек {len(dupe_ids)})")
    print(f"одно название+дата в разных городах {len(cross_city)}")
    if past_check:
        print(f"прошедших без повтора на {str(snap.get('generated_at'))[:10]} {len(past)}")
    for name, arr in (("без гео", no_geo), ("дубль", [c for v in dupe_groups.values() for c in v])):
        for c in arr[:5]:
            print(f"  [{name}] {str(c.get('id'))[:8]} {c.get('start_date')} {c.get('city')} "
                  f"{(c.get('title') or '')[:60]}")
    return {
        "count": len(cards),
        "no_geo": len(no_geo),
        "no_city": len(no_city),
        "eq_time": len(eq_time),
        "bad_end": len(bad_end),
        "dupe_groups": len(dupe_groups),
        "cross_city": len(cross_city),
        "past": len(past),
    }


def main():
    snap = load_snapshot()
    res = sweep(snap, past_check="--past-check" in sys.argv)
    bad = res["no_geo"] + res["no_city"] + res["eq_time"] + res["bad_end"] + res["dupe_groups"]
    print("ИТОГ инвариантов:", "ЧИСТО" if bad == 0 else f"ДЕФЕКТОВ {bad}")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
