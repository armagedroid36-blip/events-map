#!/usr/bin/env python3
"""Dot 1115 (часть 2): классы по снимку, не мерянные ранее.
D) end_time задан, start_time пуст (карточка печатает только окончание);
E) очень длинное название (>180 символов) — похоже, в title попал текст поста;
F) день недели в названии не совпадает с днём недели start_date у карточек БЕЗ recurrence;
G) адрес, повторяющий город (address == city без суффикса страны).
"""
import json, re, time, urllib.request, datetime as dt

URL = "https://mypins.site/data/events.json?v=%d" % int(time.time())
UA = {"User-Agent": "Mozilla/5.0 (compatible; hermes-dot-events/1.0)"}

RU_DAYS = {"понедельник": 0, "вторник": 1, "среда": 2, "среду": 2, "четверг": 3,
           "пятница": 4, "пятницу": 4, "суббота": 5, "субботу": 5, "воскресенье": 6,
           "воскресение": 6}
EN_DAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4,
           "saturday": 5, "sunday": 6}
GR_DAYS = {"δευτέρα": 0, "τρίτη": 1, "τετάρτη": 2, "πέμπτη": 3, "παρασκευή": 4,
           "σάββατο": 5, "κυριακή": 6}


def load():
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def weekday_in_title(t):
    t = (t or "").lower()
    found = set()
    for d, i in list(EN_DAYS.items()):
        if re.search(r"(?<![a-zа-я])" + d + r"(?![a-zа-я])", t):
            found.add(i)
    for d, i in RU_DAYS.items():
        if re.search(r"(?<![a-zа-яё])" + d + r"(?![a-zа-яё])", t):
            found.add(i)
    for d, i in GR_DAYS.items():
        if d in t:
            found.add(i)
    return found


def main():
    data = load()
    cards = data.get("cards") or []
    gen = data.get("generated_at")
    print("snapshot generated_at=%s cards=%d" % (gen, len(cards)))

    d_ = [c for c in cards if c.get("end_time") and not c.get("start_time")]
    print("D) end_time без start_time: %d" % len(d_))
    for c in d_[:8]:
        print("   %s «%s» %s %s-%s %s" % (c.get("id", "")[:8], (c.get("title") or "")[:50],
                                          c.get("start_date"), c.get("start_time"),
                                          c.get("end_time"), c.get("city")))

    e_ = [c for c in cards if len(c.get("title") or "") > 180]
    print("E) название >180 символов: %d" % len(e_))
    for c in sorted(e_, key=lambda x: -len(x.get("title") or ""))[:6]:
        t = c.get("title") or ""
        print("   %s len=%d «%s…»" % (c.get("id", "")[:8], len(t), t[:110]))

    f_ = []
    for c in cards:
        if c.get("recurrence"):
            continue
        sd = (c.get("start_date") or "")[:10]
        try:
            wd = dt.date.fromisoformat(sd).weekday()
        except Exception:
            continue
        for k in ("title", "title_ru", "title_en"):
            days = weekday_in_title(c.get(k))
            if days and wd not in days and len(days) == 1:
                f_.append((c.get("id"), c.get(k), sd, wd, days))
                break
    print("F) день недели в названии ≠ день start_date (без recurrence): %d" % len(f_))
    for x in f_[:10]:
        print("   %s %s «%s» (день карточки %d)" % (x[0][:8], x[2], (x[1] or "")[:50], x[3]))

    g_ = []
    for c in cards:
        city = re.sub(r",\s*(кипр|cyprus|бали|bali|вьетнам|vietnam)$", "",
                      (c.get("city") or "").strip(), flags=re.I).strip().lower()
        addr = (c.get("address") or "").strip().lower()
        if city and addr and (addr == city or addr == city + ", cyprus" or addr == city + ", кипр"):
            g_.append((c.get("id"), c.get("address"), c.get("city")))
    print("G) адрес == город: %d" % len(g_))
    for x in g_[:8]:
        print("   %s «%s» / %s" % (x[0][:8], x[1], x[2]))


if __name__ == "__main__":
    main()
