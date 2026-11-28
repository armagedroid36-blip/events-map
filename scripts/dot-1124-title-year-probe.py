#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Зонд offline-класса: «год в НАЗВАНИИ карточки не совпадает с годом её даты».

Работает по прод-снимку mypins.site/data/events.json (0 запросов к базе Supabase,
снимок тянется с cache-buster `?v=<epoch>`).

Класс: в названии явно назван год (20XX), а start_date/end_date карточки приходятся
на другой год. Так выглядят карточки, перенесённые агрегатором на будущий год
(«агрегатор переназначил СТАРОЕ событие на будущий год»), и опечатки года в заголовке.

Законно (не дефект, отсекается правилами):
  - год входит в диапазон start..end (интервал тура/фестиваля через Новый год);
  - в названии два года подряд/через слэш — сезон «2026/2027», «2026-2027»;
  - год рядом со словом «season», «сезон», «год» (номинал выпуска/сезона).

Встроенный контроль CASES обязателен: без него «дефектов 0» не считается результатом.
"""
import json
import re
import sys
import time
import urllib.request

SNAP = "https://mypins.site/data/events.json?v=%d" % int(time.time())
YEAR = re.compile(r"(?<!\d)(20[2-3]\d)(?!\d)")
SEASON_PAIR = re.compile(r"(20[2-3]\d)\s*[/–-]\s*(20[2-3]\d)")
# праздничный переход: «Ёлка 2027» 31.12.2026 и «Christmas … 2026» 01–07.01.2027
NY_EVE = (12, 31)
EPIPHANY_END = (1, 7)


def _md(card):
    s = str(card.get("start_date") or "")
    try:
        return (int(s[5:7]), int(s[8:10]))
    except ValueError:
        return None



def titles(card):
    out = []
    for k in ("title", "title_ru", "title_en"):
        v = card.get(k)
        if v:
            out.append((k, v))
    return out


def years_in(text):
    return [int(y) for y in YEAR.findall(text)]


def is_defect(card):
    """(bool, ключ поля, строка названия, годы названия, start, end)"""
    sy = str(card.get("start_date") or "")[:4]
    ey = str(card.get("end_date") or "")[:4] or sy
    if not sy.isdigit():
        return None
    lo, hi = int(sy), int(ey)
    for field, text in titles(card):
        ys = years_in(text)
        if not ys:
            continue
        # сезон «2026/2027» — законно, если один из годов совпал с датой
        if SEASON_PAIR.search(text):
            continue
        if any(lo <= y <= hi for y in ys):
            continue
        md = _md(card)
        # праздничный переход года: название метит НАСТУПАЮЩИЙ год, дата 31.12;
        # либо название метит УШЕДШИЙ год, дата 01–07.01 (рождественская ярмарка тянется)
        if md and all(
            (y == lo + 1 and md == NY_EVE) or (y == lo - 1 and md[0] == 1 and md[1] <= EPIPHANY_END[1])
            for y in ys
        ):
            continue
        return (field, text, ys, sy, ey)
    return None


CASES = [
    # (описание, карточка, ожидание)
    ("год в прошлом при будущей дате", {"title": "Christmas Market 2025", "start_date": "2026-12-05"}, True),
    ("год совпал", {"title": "Christmas Market 2026", "start_date": "2026-12-05"}, False),
    ("год = конец интервала", {"title": "Фестиваль 2027", "start_date": "2026-12-28", "end_date": "2027-01-05"}, False),
    ("сезон через слэш", {"title": "Season 2026/2027", "start_date": "2026-11-01"}, False),
    ("сезон через дефис (en dash)", {"title": "Winter Season 2026–2027", "start_date": "2026-11-01"}, False),
    ("нет года в названии", {"title": "Jazz Night", "start_date": "2026-12-05"}, False),
    ("год только в title_ru", {"title": "Yoga", "title_ru": "Йога 2025", "start_date": "2026-12-05"}, True),
    ("номер выпуска не год", {"title": "Women in Wine #3", "start_date": "2026-12-05"}, False),
    ("год в адресе, не в названии", {"title": "Party", "address": "2025 Street", "start_date": "2026-12-05"}, False),
    ("Ёлка 2027 31.12.2026 — переход года", {"title": "Ёлка 2027", "start_date": "2026-12-31"}, False),
    ("Christmas 2026 тянется до 06.01.2027", {"title": "Christmas Market 2026", "start_date": "2027-01-06"}, False),
    ("Ярмарка 2026 в середине февраля 2027 — кандидат", {"title": "Christmas Market 2026", "start_date": "2027-02-06"}, True),
]


def control():
    ok = 0
    for name, card, expect in CASES:
        got = is_defect(card) is not None
        if got == expect:
            ok += 1
        else:
            print("КОНТРОЛЬ ПРОВАЛЕН: %s -> %s (ждали %s)" % (name, got, expect))
    return ok, len(CASES)


def main():
    ok, total = control()
    print("КОНТРОЛЬ СЕНСОРА: %d/%d" % (ok, total))
    req = urllib.request.Request(SNAP, headers={"User-Agent": "Mozilla/5.0"})
    data = json.load(urllib.request.urlopen(req, timeout=90))
    cards = data.get("cards") or []
    print("СНИМОК: generated_at %s, карточек %d" % (data.get("generated_at"), len(cards)))
    hits = []
    for c in cards:
        d = is_defect(c)
        if d:
            hits.append(("%s" % str(c.get("id"))[:8], c.get("city"), d))
    print("РАСХОЖДЕНИЙ: %d" % len(hits))
    for cid, city, d in hits:
        field, text, ys, sy, ey = d
        print("  %s | %s | %s | %s | %s..%s" % (cid, city, ",".join(map(str, ys)), text[:70], sy, ey))
    return 0 if (ok == total) else 2


if __name__ == "__main__":
    sys.exit(main())
