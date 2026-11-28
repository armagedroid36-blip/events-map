#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Зонд 1134: индексируемость АРХИВА на mypins.site.

Вопрос запуска: в sitemap.xml лежат ли страницы, которые сами отдают
noindex (противоречие «sitemap -> noindex»), и наоборот — сколько
страниц с плашкой «Событие прошло» индексируемы законно (окно 14 дней).

Правило сайта (scripts/seo-prerender.mjs):
  ARCHIVE_INDEX_WINDOW_DAYS = 14; прошедшее событие, последний день которого
  старше окна -> meta robots noindex,follow И вне sitemap.
  Значит в sitemap допустимы ТОЛЬКО: будущие события и прошедшие в окне.

Секции:
  A) sitemap: сколько event-URL, сколько RU/EN;
  B) выборка N URL: http-код, есть ли noindex, есть ли плашка «прошло»;
  C) ДЕФЕКТ 1: URL из sitemap с noindex (страница сама себя исключает);
  D) ДЕФЕКТ 2: страница с плашкой «прошло», без noindex, но последний день
     старше окна 14 дней (должна была уйти в noindex);
  E) норма: будущие 200 без noindex.

0 запросов к базе. Контроль сенсора CASES при --self-test.
"""
import json, re, sys, random, urllib.request, collections, datetime, time as _t
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36"}
SITE = "https://mypins.site"
N = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 50
SEED = 1134
WINDOW_DAYS = 14


def get(url, tries=2, timeout=25):
    last = None
    for _ in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)
            return r.status, r.read().decode("utf-8", "replace")
        except Exception as e:
            code = getattr(e, "code", None)
            if code:
                return code, ""
            last = e
    return None, str(last)


def today_msk():
    return _t.strftime("%Y-%m-%d", _t.gmtime(_t.time() + 3 * 3600))


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


def analyze(url):
    """Одна страница: (можно ли назвать дефектом, метка класса, детали)."""
    cid = re.search(r"/event/([0-9a-f-]{36})", url)
    cid = cid.group(1)[:8] if cid else "?"
    code, html = get(url)
    if code != 200:
        return ("http_%s" % code, cid, None)
    low = html.lower()
    noindex = bool(re.search(r'<meta\s+name="robots"\s+content="[^"]*noindex', low))
    ended = ("событие прошло" in low) or ("event has ended" in low)
    evs = []
    for blob in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            find_events(json.loads(blob), evs)
        except Exception:
            pass
    last = None
    if evs:
        e = evs[0]
        last = (e.get("endDate") or e.get("startDate") or "")[:10] or None
    if last is None:
        m = re.search(r'<time[^>]+datetime="(\d{4}-\d{2}-\d{2})', html)
        last = m.group(1) if m else None
    return ("ok", cid, dict(noindex=noindex, ended=ended, last=last))


def self_test():
    """Контроль сенсора: правила классификации на синтетических признаках."""
    def classify(noindex, ended, last, taj, in_sitemap=True):
        if noindex and in_sitemap:
            return "C_noindex_in_sitemap"
        if ended and not noindex and last:
            cutoff = (datetime.date.fromisoformat(taj) - datetime.timedelta(days=WINDOW_DAYS)).isoformat()
            if last < cutoff:
                return "D_ended_indexable_outside_window"
            return "E_ended_within_window_ok"
        if ended and not noindex and not last:
            return "F_ended_no_date"
        return "N_future_ok"

    taj = "2026-11-28"
    cases = [
        # (noindex, ended, last, expected)
        (True, True, "2026-10-01", "C_noindex_in_sitemap"),
        (True, False, None, "C_noindex_in_sitemap"),
        (False, True, "2026-09-01", "D_ended_indexable_outside_window"),
        (False, True, "2026-10-01", "D_ended_indexable_outside_window"),
        (False, True, "2026-11-20", "E_ended_within_window_ok"),
        (False, True, "2026-11-14", "E_ended_within_window_ok"),
        (False, True, "2026-11-13", "D_ended_indexable_outside_window"),
        (False, False, None, "N_future_ok"),
        (False, False, "2026-12-05", "N_future_ok"),
        (False, True, None, "F_ended_no_date"),
    ]
    ok = 0
    for noi, end, last, exp in cases:
        got = classify(noi, end, last, taj)
        if got == exp:
            ok += 1
        else:
            print("  CASE FAIL:", noi, end, last, "ожидали", exp, "получили", got)
    print("КОНТРОЛЬ СЕНСОРА: %d/%d" % (ok, len(cases)))
    return ok == len(cases)


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    taj = today_msk()
    cutoff = (datetime.date.fromisoformat(taj) - datetime.timedelta(days=WINDOW_DAYS)).isoformat()
    st, sm = get(SITE + "/sitemap.xml")
    urls = re.findall(r"<loc>([^<]+)</loc>", sm or "")
    ev = [u for u in urls if re.search(r"/event/[0-9a-f]{8}", u)]
    ru = [u for u in ev if "/en/event/" not in u]
    print("A) sitemap: url %d | event %d (RU %d / EN %d) | http %s" % (
        len(urls), len(ev), len(ru), len(ev) - len(ru), st))
    print("   сегодня %s, окно индексируемости архива с %s" % (taj, cutoff))

    random.seed(SEED)
    sample = random.sample(ev, min(N, len(ev)))
    res = collections.Counter()
    defects_c, defects_d, no_date = [], [], []
    with ThreadPoolExecutor(max_workers=10) as ex:
        for tag, cid, d in ex.map(analyze, sample):
            if tag != "ok":
                res[tag] += 1
                continue
            res["http_200"] += 1
            if d["noindex"]:
                res["C_noindex"] += 1
                defects_c.append(cid)
                continue
            if d["ended"]:
                res["ended"] += 1
                if not d["last"]:
                    res["F_ended_no_date"] += 1
                    no_date.append(cid)
                elif d["last"] < cutoff:
                    res["D_outside_window"] += 1
                    defects_d.append((cid, d["last"]))
                else:
                    res["E_within_window_ok"] += 1
            else:
                res["N_indexable_ok"] += 1

    print("B) выборка %d:" % len(sample), dict(res))
    print("C) ДЕФЕКТ sitemap->noindex:", len(defects_c), defects_c[:8])
    print("D) ДЕФЕКТ прошло-без-noindex-вне окна:", len(defects_d), defects_d[:8])
    print("F) прошло без определимой даты:", len(no_date), no_date[:8])

    # G) обратная сторона: архив ВНЕ окна (в sitemap его быть не должно) обязан
    #    отдавать noindex. Берём карточки снимка, последний день < cutoff.
    st3, snap = get(SITE + "/data/events.json?v=%d" % int(_t.time()))
    arch = []
    if st3 == 200 and snap:
        for c in json.loads(snap).get("cards", []):
            if c.get("recurrence"):
                continue
            last = c.get("end_date") or c.get("start_date")
            if last and last < cutoff:
                arch.append(c["id"])
    random.seed(SEED + 1)
    asample = random.sample(arch, min(15, len(arch))) if arch else []
    g_ok, g_bad = 0, []
    for cid in asample:
        code, html = get(SITE + "/event/%s/" % cid)
        if code != 200:
            g_bad.append((cid[:8], "http_%s" % code))
            continue
        low = html.lower()
        if re.search(r'<meta\s+name="robots"\s+content="[^"]*noindex', low):
            g_ok += 1
        elif 'http-equiv="refresh"' in low or "/event/" in low and "not found" in low:
            g_ok += 1  # редирект/404-заглушка без индексации
        else:
            g_bad.append((cid[:8], "indexable"))
    print("G) архив вне окна: карточек %d, проверено %d, noindex %d, НАРУШЕНИЙ %d %s" % (
        len(arch), len(asample), g_ok, len(g_bad), g_bad[:8]))


if __name__ == "__main__":
    main()
