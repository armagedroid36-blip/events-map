#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Зонд 1133: структурированные данные (JSON-LD Event) на детальных страницах
событий mypins.site. 0 запросов к базе: снимок витрины + HTML страниц.

Классы, которые различает зонд (важно, иначе «нет Event» читается как дефект):
  A) страница 200 и Event-LD есть -> считаем совпадение startDate/endDate и гео с снимком;
  B) Event-LD НЕТ и событие ПРОШЛОЕ (end/start < сегодня) -> норма (схему для прошедших не отдают);
  C) Event-LD НЕТ и id НЕТ в снимке -> страница архивного/устаревшего события из sitemap;
  D) Event-LD НЕТ, событие будущее и есть в снимке -> ДЕФЕКТ;
  E) startDate != start_date ТОЛЬКО у серии (recurrence) -> норма (дата ближайшего вхождения);
  F) гео JSON-LD дальше 0.5 км от пина карточки -> ДЕФЕКТ.
Питфол сенсора: Event лежит внутри @graph — обход рекурсивный, иначе «0 Event» на всех страницах.
"""
import json, re, sys, math, random, urllib.request, collections

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36"}
SITE = "https://mypins.site"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
SEED = 1133


def get(url, tries=2, timeout=25):
    last = None
    for i in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)
            return r.status, r.read().decode("utf-8", "replace")
        except Exception as e:
            code = getattr(e, "code", None)
            if code:
                return code, ""
            last = e
    return None, str(last)


def find_events(o, out):
    if isinstance(o, dict):
        t = o.get("@type")
        if t == "Event" or (isinstance(t, list) and "Event" in t):
            out.append(o)
        for v in o.values():
            find_events(v, out)
    elif isinstance(o, list):
        for v in o:
            find_events(v, out)


def dist_km(lat1, lng1, lat2, lng2):
    dx = (float(lat1) - float(lat2)) * 111.0
    dy = (float(lng1) - float(lng2)) * 111.0 * math.cos(math.radians(float(lat1)))
    return (dx * dx + dy * dy) ** 0.5


def today():
    import datetime, time as _t
    return _t.strftime("%Y-%m-%d", _t.gmtime(_t.time() + 3 * 3600))  # МСК


def main():
    taj = today()
    st, sm = get(SITE + "/sitemap.xml")
    urls = re.findall(r"<loc>([^<]+)</loc>", sm or "")
    evurls = [u for u in urls if re.search(r"/event/[0-9a-f]{8}", u)]
    st2, snap = get(SITE + "/data/events.json?v=%d" % int(__import__("time").time()))
    data = json.loads(snap)
    cards = {c["id"]: c for c in data.get("cards", [])}
    print("sitemap url:", len(urls), "| event url:", len(evurls), "| снимок:", data.get("generated_at"), len(cards))

    random.seed(SEED)
    sample = random.sample(evurls, min(N, len(evurls)))
    res = collections.Counter()
    d_no_ld, d_date_future, d_geo, c_arch, b_past = [], [], [], [], []
    for u in sample:
        cid = re.search(r"/event/([0-9a-f-]{36})", u).group(1)
        c = cards.get(cid)
        code, html = get(u)
        if code != 200:
            res["http_%s" % code] += 1
            continue
        res["http_200"] += 1
        evs = []
        for blob in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
            try:
                find_events(json.loads(blob), evs)
            except Exception:
                pass
        if not evs:
            if c is None:
                res["C_archived_page"] += 1; c_arch.append(cid[:8])
            elif (c.get("end_date") or c.get("start_date") or "9999") < taj:
                res["B_past_no_ld"] += 1; b_past.append(cid[:8])
            else:
                res["D_defect_no_ld"] += 1; d_no_ld.append((cid[:8], c.get("start_date"), c.get("city")))
            continue
        res["A_event_ld"] += 1
        e = evs[0]
        sd = (e.get("startDate") or "")[:10]
        ed = (e.get("endDate") or "")[:10]
        if c:
            rec = bool(c.get("recurrence"))
            if sd and sd != c["start_date"]:
                if rec:
                    res["E_series_next_date"] += 1
                else:
                    res["D_defect_date"] += 1; d_date_future.append((cid[:8], sd, c["start_date"], c.get("city")))
            if c.get("end_date") and ed and ed != c["end_date"] and not rec:
                res["D_defect_end_date"] += 1; d_date_future.append((cid[:8], "END " + ed, c["end_date"], c.get("city")))
            geo = ((e.get("location") or {}).get("geo") or {}) if isinstance(e.get("location"), dict) else {}
            if geo.get("latitude") and c.get("lat"):
                d = dist_km(geo["latitude"], geo["longitude"], c["lat"], c["lng"])
                if d > 0.5:
                    res["F_geo_mismatch"] += 1; d_geo.append((cid[:8], round(d, 2), c.get("city")))
    print("ИТОГ:", dict(res))
    print("D нет Event-LD (дефект):", len(d_no_ld), d_no_ld[:6])
    print("D расхождение дат:", len(d_date_future), d_date_future[:6])
    print("F гео дальше 0.5 км:", len(d_geo), d_geo[:6])
    print("C страница вне снимка (архив/устаревшая):", len(c_arch), c_arch[:8])
    print("B прошедшие без Event-LD (норма):", len(b_past), b_past[:8])


if __name__ == "__main__":
    main()
