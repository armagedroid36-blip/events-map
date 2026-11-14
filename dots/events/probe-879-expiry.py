import json, os, re, glob, datetime, sys

T = os.environ['LOCALAPPDATA'] + '\\Temp'
SNAP = sys.argv[1] if len(sys.argv) > 1 else T + '\\prod.json'
snap = json.load(open(SNAP, encoding='utf-8'))
cards = {c['id']: c for c in snap['cards']}
today = datetime.date(2026, 11, 14)   # дата запуска 879
D_MAP = datetime.date(2026, 11, 22)   # карта начнёт терять снапшот (gen 08.11 + 14 сут)

DIRS = [r'C:\Users\armag\projects\events-map\dots\events',
        r'C:\Users\armag\AppData\Local\hermes\dots\events']

by_name = {}
for d in DIRS:
    for f in sorted(glob.glob(d + r'\*-apply.mjs')):
        by_name.setdefault(os.path.basename(f), f)   # repo-копия приоритетнее hermes
scripts = list(by_name.values())

all_ids, rows = set(), []
for f in scripts:
    txt = open(f, encoding='utf-8').read()
    ids = set(m.group(1) for m in re.finditer(r'\b([0-9a-f]{8})\b', txt))
    targets = [cid for cid in cards if any(cid.startswith(i) for i in ids)]
    all_ids.update(targets)
    if not targets:
        print(f'{os.path.basename(f):32s} -> 0 целей в снапшоте')
        continue
    past, soon3, soonmap = [], 0, 0
    for cid in targets:
        c = cards[cid]
        sd = datetime.date.fromisoformat(c['start_date'][:10])
        ed = datetime.date.fromisoformat(c['end_date'][:10]) if c.get('end_date') else sd
        left = (ed - today).days
        if left < 0:
            past.append((cid[:8], c['start_date'][:10], (c.get('title') or '')[:30]))
        elif left <= 3:
            soon3 += 1
        if ed >= D_MAP:
            soonmap += 1
    rows.append((os.path.basename(f), len(targets), len(past), soon3, soonmap))
    print(f'{os.path.basename(f):32s} целей {len(targets):3d}  прошли {len(past):2d}  ≤3дн {soon3:2d}  живут после 22.11 {soonmap:3d}')
    for p in past[:3]:
        print('     past:', p)

print('---')
print('скриптов:', len(scripts), '| уникальных целей:', len(all_ids))
print('целей с прошедшей датой:', sum(r[2] for r in rows),
      '| истекают до 17.11 включительно:', sum(r[3] for r in rows),
      '| доживают до 22.11:', sum(r[4] for r in rows))
print(f'снапшот: {SNAP} | карточек {len(cards)} | generated_at {snap.get("generated_at")}')
