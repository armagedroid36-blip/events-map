import json, os, re, glob, datetime
T = os.environ['LOCALAPPDATA'] + '\\Temp'
snap = json.load(open(T + '\\prod-852.json', encoding='utf-8'))
cards = {c['id']: c for c in snap['cards']}
today = datetime.date(2026, 11, 13)
scripts = glob.glob(r'C:\Users\armag\projects\events-map\dots\events\*-apply.mjs')
rows = []
for f in scripts:
    txt = open(f, encoding='utf-8').read()
    ids = set()
    for m in re.finditer(r"\b([0-9a-f]{8})\b", txt):
        ids.add(m.group(1))
    targets = [cid for cid in cards if any(cid.startswith(i) for i in ids)]
    if not targets:
        print(os.path.basename(f), '-> 0 targets'); continue
    past, soon = [], []
    for cid in targets:
        c = cards[cid]
        sd = datetime.date.fromisoformat(c['start_date'][:10])
        ed = datetime.date.fromisoformat(c['end_date'][:10]) if c.get('end_date') else sd
        left = (ed - today).days
        if left < 0: past.append((cid[:8], c['start_date'][:10], c.get('title', '')[:34]))
        elif left <= 5: soon.append((cid[:8], c['start_date'][:10], left))
    rows.append((os.path.basename(f), len(targets), len(past), len(soon)))
    print(f"{os.path.basename(f)}: targets {len(targets)}, уже прошли {len(past)}, истекают ≤5 дн {len(soon)}")
    for p in past[:4]: print('   past:', p)
allt = sum(r[1] for r in rows)
print('ИТОГО целей:', allt, 'прошедших:', sum(r[2] for r in rows), 'истекают ≤5 дн:', sum(r[3] for r in rows))
