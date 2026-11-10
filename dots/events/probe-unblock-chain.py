import json, re, os

SNAP = os.path.expandvars(r"%LOCALAPPDATA%\Temp\prod.json")
snap = json.load(open(SNAP, encoding="utf-8"))
cards = snap["cards"]
byid = {c["id"]: c for c in cards}
prefix = {}
for c in cards:
    prefix.setdefault(c["id"][:8].lower(), []).append(c["id"])

files = [
    ("dupes-822", r"C:\Users\armag\AppData\Local\hermes\dots\events\dupes-822-apply.mjs"),
    ("pins-826", r"C:\Users\armag\AppData\Local\hermes\dots\events\pins-826-apply.mjs"),
    ("endtime-835", r"C:\Users\armag\projects\events-map\dots\events\endtime-835-apply.mjs"),
    ("endtime-840", r"C:\Users\armag\projects\events-map\dots\events\endtime-840-apply.mjs"),
    ("addams-842", r"C:\Users\armag\projects\events-map\dots\events\serie-addams-842-apply.mjs"),
    ("aggregate-843", r"C:\Users\armag\projects\events-map\dots\events\aggregate-run-843-apply.mjs"),
]
UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
PFX = re.compile(r"\bid:\s*'([0-9a-f]{8})'", re.I)

touched, ambig, missing = {}, [], []
for name, path in files:
    src = open(path, encoding="utf-8").read()
    ids = set(m.group(0).lower() for m in UUID.finditer(src))
    for p in set(m.group(1).lower() for m in PFX.finditer(src)):
        if len(prefix.get(p, [])) == 1:
            ids.add(prefix[p][0])
        elif len(prefix.get(p, [])) > 1:
            ambig.append((name, p, prefix[p]))
        else:
            missing.append((name, p))
    for i in ids:
        if i not in byid:
            missing.append((name, i))
        touched.setdefault(i, set()).add(name)

print("карточек в снапшоте:", len(cards), "| целей в скриптах:", len(touched))
print("не найдено в снапшоте:", missing if missing else "нет")
print("неоднозначных 8-префиксов:", ambig if ambig else "нет")
for name, _ in files:
    n = sum(1 for v in touched.values() if name in v)
    print(f"  {name}: {n}")

over = {k: v for k, v in touched.items() if len(v) > 1}
print("\nПЕРЕСЕЧЕНИЯ между скриптами:", len(over))
for k, v in over.items():
    c = byid[k]
    print("  ", k[:8], sorted(v), c.get("start_date"), str(c.get("title"))[:55])
