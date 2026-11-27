#!/usr/bin/env python3
"""Поиск дублей по ГЕО-БЛИЗОСТИ в прод-снимке (offline, ноль запросов к базе).

Зачем: при 402 exceed_egress_quota база не читается, а снимок витрины даёт
id/title/title_ru/title_en/start_date/start_time/city/lat/lng/recurrence.
Штатный дедуп (liveDupeMatch) требует СОВПАДЕНИЯ адреса, поэтому пары
«одно событие у двух источников, разные языки названия, метки городов разные»
он не видит (кейс 1097: Makis Dimakis ⇄ Μάκης Δημάκης στον Πρωταρά).

Правило поиска (тройка признаков): та же дата + то же время начала +
точки в пределах RADIUS_M метров. Кандидат печатается с общими словами названий,
чтобы ложные пары (разные события одного клуба) отсекались глазами.

Запуск: python scripts/dot-snapshot-near-dupe.py [--radius 300] [--date 2026-12-26]
"""
import argparse
import json
import math
import re
import sys
import time
import unicodedata
import urllib.request

SNAP_URL = "https://mypins.site/data/events.json"
UA = "hermes-dot-events/1.0"

STOP = {
    # типы событий и служебное
    "концерт", "лекция", "семинар", "курс", "турнир", "фестиваль", "вечер", "вечеринка",
    "выставка", "спектакль", "мастер", "класс", "занятие", "тренировка", "йога", "шоу",
    "party", "concert", "live", "show", "event", "festival", "night", "evening", "class",
    "workshop", "tournament", "lecture", "seminar", "exhibition", "theatre", "theater",
    # дни недели
    "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    # служебные
    "the", "and", "for", "with", "in", "at", "on", "of", "a", "an", "to", "by",
    "и", "в", "на", "с", "по", "для", "от", "до", "the",
    "кипр", "cyprus", "бали", "bali", "дания", "дананг", "нячанг", "вьетнам", "vietnam",
}
PLACE_STOP = {"bar", "club", "restaurant", "cafe", "hotel", "hall", "theatre", "theater",
              "square", "park", "beach", "street", "avenue", "ул", "улица", "бар", "клуб"}


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


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s


def city_stems(card):
    """Стебли слов названия города карточки: «Лимасол, Кипр» -> {лимас, лимасс, кипр}.
    Слова города не доказывают, что событие одно (питфолы 1067/1091)."""
    out = set()
    for part in str(card.get("city") or "").lower().replace(",", " ").split():
        if len(part) >= 4:
            out.add(part[:5])
    return out


def words(*titles):
    out = set()
    for t in titles:
        if not t:
            continue
        for w in re.findall(r"[a-zа-яё0-9]+", norm(t)):
            if len(w) < 4 or w in STOP or w in PLACE_STOP or w.isdigit():
                continue
            out.add(w)
    return out


def dist_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat = la2 - la1
    dlon = lo2 - lo1
    h = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(min(1, math.sqrt(h)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--radius", type=int, default=300)
    ap.add_argument("--date", default=None, help="ограничить одной датой YYYY-MM-DD")
    args = ap.parse_args()

    snap = load_snapshot()
    cards = cards_of(snap)
    print(f"снимок generated_at={snap.get('generated_at')} count={len(cards)}")

    buckets = {}
    skipped_nogeo = 0
    for c in cards:
        if args.date and c.get("start_date") != args.date:
            continue
        lat, lng = c.get("lat"), c.get("lng")
        if lat is None or lng is None:
            skipped_nogeo += 1
            continue
        key = (c.get("start_date"), (c.get("start_time") or "")[:5])
        buckets.setdefault(key, []).append(c)

    pairs = []
    for key, group in buckets.items():
        if len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                d = dist_m((a["lat"], a["lng"]), (b["lat"], b["lng"]))
                if d > args.radius:
                    continue
                cs = city_stems(a) | city_stems(b)
                wa = words(a.get("title"), a.get("title_ru"), a.get("title_en"))
                wb = words(b.get("title"), b.get("title_ru"), b.get("title_en"))
                common = {w for w in (wa & wb) if w[:5] not in cs}
                if len(common) < 2:
                    continue
                pairs.append((d, key, a, b, common))

    pairs.sort(key=lambda x: x[0])
    print(f"кандидатов (дата+время+<{args.radius}м+2 общих слова): {len(pairs)}; без гео {skipped_nogeo}")
    for d, key, a, b, common in pairs:
        print(f"\n{d:6.0f} м | {key[0]} {key[1] or '(время не указано)'}")
        print(f"  A {str(a.get('id'))[:8]} [{a.get('city')}] {a.get('title')}")
        print(f"  B {str(b.get('id'))[:8]} [{b.get('city')}] {b.get('title')}")
        print(f"  общие: {sorted(common)}")


if __name__ == "__main__":
    sys.exit(main())
