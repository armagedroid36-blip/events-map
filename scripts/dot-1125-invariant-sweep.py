#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Зонд offline-класса «остаточные инварианты карточки» по прод-снимку.

0 запросов к базе Supabase: снимок mypins.site/data/events.json (?v=epoch).
Секции (все считаются по ЖИВЫМ карточкам снимка):
  A) end_time задан, end_date пуст — окончание без даты окончания;
  B) start_date == end_date и end_time < start_time без ночного перехода;
  C) адрес или city короче 4 символов;
  D) одинаковая пара (название, время) в одном городе на РАЗНЫХ датах, при этом
     recurrence пуст — серия без правила повтора (одноразовые повторы);
  E) пин с грубой точностью <=3 знаков после запятой (округлённая точка).
Встроенный контроль CASES: без него «0 дефектов» результатом не считается.
"""
import json, re, sys, time, urllib.request

SNAP = "https://mypins.site/data/events.json?v=%d" % int(time.time())


def load():
    req = urllib.request.Request(SNAP, headers={"User-Agent": "hermes-dot-events/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def hm(v):
    s = str(v or "")
    m = re.match(r"^(\d{1,2}):(\d{2})", s)
    return (int(m.group(1)), int(m.group(2))) if m else None


def names(c):
    return {str(c.get(k) or "").strip() for k in ("title", "title_ru", "title_en") if str(c.get(k) or "").strip()}


def has_rec(c):
    r = c.get("recurrence")
    return isinstance(r, dict) and bool(r)


def section_a(cards):
    return [c for c in cards if hm(c.get("end_time")) and not c.get("end_date")]


def section_b(cards):
    out = []
    for c in cards:
        sd, ed = c.get("start_date"), c.get("end_date")
        st, et = hm(c.get("start_time")), hm(c.get("end_time"))
        if not (sd and ed and sd == ed and st and et):
            continue
        if et < st and not (st[0] >= 18 and et[0] <= 6):
            out.append(c)
    return out


def section_c(cards):
    out = []
    for c in cards:
        a = str(c.get("address") or "").strip()
        ci = str(c.get("city") or "").strip()
        if (a and len(a) < 4) or (ci and len(ci) < 4):
            out.append(c)
    return out


def section_d(cards):
    buckets = {}
    for c in cards:
        st = hm(c.get("start_time"))
        key = (c.get("city"), st[0] if st else None, st[1] if st else None)
        buckets.setdefault(key, []).append(c)
    pairs = []
    for key, grp in buckets.items():
        if len(grp) < 2:
            continue
        for i in range(len(grp)):
            for j in range(i + 1, len(grp)):
                a, b = grp[i], grp[j]
                if a.get("start_date") == b.get("start_date"):
                    continue
                if has_rec(a) or has_rec(b):
                    continue
                na, nb = names(a), names(b)
                if not (na & nb):
                    continue
                # на одной точке (<=150 м) и в один день недели
                try:
                    d = ((float(a["lat"]) - float(b["lat"])) ** 2 + (float(a["lng"]) - float(b["lng"])) ** 2) ** 0.5
                except Exception:
                    continue
                if d * 111000 > 150:
                    continue
                wd_a = time.strptime(a["start_date"], "%Y-%m-%d").tm_wday
                wd_b = time.strptime(b["start_date"], "%Y-%m-%d").tm_wday
                if wd_a != wd_b:
                    continue
                pairs.append((a["id"][:8], b["id"][:8], a["start_date"], b["start_date"],
                              (na & nb).pop()[:40], a.get("city")))
    return pairs


def section_e(cards):
    def coarse(v):
        s = repr(float(v))
        frac = s.split(".")[1] if "." in s else ""
        return len(frac.rstrip("0")) <= 4
    return [c for c in cards if c.get("lat") and c.get("lng") and coarse(c["lat"]) and coarse(c["lng"])]


CASES = [
    ("A", {"end_time": "22:00", "end_date": None}, True, section_a),
    ("A", {"end_time": "22:00", "end_date": "2026-11-28"}, False, section_a),
    ("B", {"start_date": "2026-11-28", "end_date": "2026-11-28", "start_time": "20:00", "end_time": "19:00"}, True, section_b),
    ("B", {"start_date": "2026-11-28", "end_date": "2026-11-28", "start_time": "22:00", "end_time": "02:00"}, False, section_b),
    ("C", {"address": "abc", "city": "Убуд, Bali"}, True, section_c),
    ("C", {"address": None, "city": "Убуд, Bali"}, False, section_c),
    ("E", {"lat": 34.6786, "lng": 33.0413}, True, section_e),
    ("E", {"lat": 34.6786123, "lng": 33.0413456}, False, section_e),
]


def control():
    ok = 0
    for tag, card, expect, fn in CASES:
        card.setdefault("id", "ctrl")
        got = len(fn([card])) > 0
        ok += (got == expect)
        if got != expect:
            print("  КОНТРОЛЬ ПРОВАЛ: %s %s -> %s" % (tag, card, got))
    return ok, len(CASES)


def main():
    ok, total = control()
    print("КОНТРОЛЬ СЕНСОРА: %d/%d" % (ok, total))
    if ok != total:
        sys.exit(3)
    data = load()
    cards = data.get("cards") or []
    print("снимок generated_at=%s, карточек %d" % (data.get("generatedAt") or data.get("generated_at"), len(cards)))
    a = section_a(cards)
    b = section_b(cards)
    c = section_c(cards)
    d = section_d(cards)
    e = section_e(cards)
    print("A) end_time без end_date: %d %s" % (len(a), [(x["id"][:8], x.get("title","")[:30]) for x in a[:6]]))
    print("B) конец раньше начала в один день: %d %s" % (len(b), [(x["id"][:8], x.get("start_time"), x.get("end_time")) for x in b[:6]]))
    print("C) адрес/city короче 4: %d %s" % (len(c), [(x["id"][:8], repr(x.get("address"))[:20], x.get("city")) for x in c[:6]]))
    print("D) серии без recurrence (то же название+время, разные даты, один день недели, <=150 м): %d" % len(d))
    for p in d[:10]:
        print("   ", p)
    print("E) грубая точность пина (<=3 знака): %d %s" % (len(e), [(x["id"][:8], x.get("city"), x.get("lat"), x.get("lng")) for x in e[:8]]))


if __name__ == "__main__":
    main()
