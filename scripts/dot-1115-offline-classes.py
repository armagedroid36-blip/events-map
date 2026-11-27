#!/usr/bin/env python3
"""Dot 1115: офлайн-классы по прод-снимку витрины (0 запросов к базе).
A) дубли названий, отличающихся ТОЛЬКО регистром/пунктуацией/пробелами
   (одна дата + один город) — штатный ключ title|start_date такие пары не видит;
B) даты далеко впереди (> 400 дней) — признак мусора парсера;
C) схема recurrence: freq вне {daily,weekly}, weekly без days, days вне 1..7.
Запуск: python scripts/dot-1115-offline-classes.py
"""
import json, re, sys, time, unicodedata, urllib.request

URL = "https://mypins.site/data/events.json?v=%d" % int(time.time())
UA = {"User-Agent": "Mozilla/5.0 (compatible; hermes-dot-events/1.0)"}


def load():
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
    data = json.loads(raw.decode("utf-8", "replace"))
    return data


def norm(t):
    if not t:
        return ""
    t = unicodedata.normalize("NFKC", t).lower()
    t = re.sub(r"[«»\"'“”„’`]", "", t)
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def main():
    data = load()
    gen = data.get("generated_at") or data.get("generatedAt")
    cards = data.get("cards") or data.get("events") or []
    print("snapshot generated_at=%s cards=%d" % (gen, len(cards)))

    # --- A: дубли по нормализованному названию (дата + город) ---
    groups = {}
    for c in cards:
        t = norm(c.get("title") or c.get("title_ru") or "")
        alts = {norm(c.get(k)) for k in ("title", "title_ru", "title_en") if c.get(k)}
        alts.discard("")
        if not alts:
            continue
        key_date = (c.get("start_date") or "")[:10]
        city = (c.get("city") or "").strip()
        for a in alts:
            groups.setdefault((key_date, city, a), []).append(c)

    pairs = []
    seen = set()
    for key, lst in groups.items():
        if len(lst) < 2:
            continue
        ids = sorted({x.get("id") for x in lst})
        if len(ids) < 2:
            continue
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                pk = (ids[i], ids[j])
                if pk in seen:
                    continue
                seen.add(pk)
                pairs.append(pk)
    print("A) нормализованные дубли (дата+город+название): %d пар" % len(pairs))
    byid = {c.get("id"): c for c in cards}
    for a, b in pairs[:8]:
        ca, cb = byid.get(a), byid.get(b)
        print("   %s «%s» %s %s | %s «%s» %s %s | %s / %s" % (
            a[:8], ca.get("title"), ca.get("start_date"), ca.get("start_time"),
            b[:8], cb.get("title"), cb.get("start_date"), cb.get("start_time"),
            ca.get("city"), cb.get("city")))

    # --- B: даты далеко впереди ---
    today = time.strftime("%Y-%m-%d")
    import datetime as dt
    t0 = dt.date.fromisoformat(today)
    far = []
    for c in cards:
        sd = (c.get("start_date") or "")[:10]
        try:
            d = dt.date.fromisoformat(sd)
        except Exception:
            continue
        if (d - t0).days > 400:
            far.append((c.get("id"), sd, (c.get("title") or "")[:60], c.get("city")))
    print("B) start_date > 400 дней вперёд: %d" % len(far))
    for f in far[:10]:
        print("   %s %s «%s» %s" % (f[0][:8], f[1], f[2], f[3]))

    # --- C: схема recurrence ---
    bad_rec = []
    rec_n = 0
    for c in cards:
        rec = c.get("recurrence")
        if not rec or not isinstance(rec, dict) or not rec:
            continue
        rec_n += 1
        freq = str(rec.get("freq") or "").lower()
        days = rec.get("days")
        problems = []
        if freq not in ("daily", "weekly"):
            problems.append("freq=%r" % rec.get("freq"))
        if freq == "weekly":
            if not isinstance(days, list) or not days:
                problems.append("weekly без days")
            else:
                bad = [d for d in days if not (isinstance(d, int) and 1 <= d <= 7)]
                if bad:
                    problems.append("days вне 1..7: %r" % bad)
        if problems:
            bad_rec.append((c.get("id"), c.get("title"), problems, rec))
    print("C) карточек с recurrence: %d, дефектов схемы: %d" % (rec_n, len(bad_rec)))
    for x in bad_rec[:10]:
        print("   %s «%s» %s %r" % (x[0][:8], (x[1] or "")[:50], x[2], x[3]))


if __name__ == "__main__":
    main()
