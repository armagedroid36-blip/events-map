import json, re, os, sys
from math import radians, sin, cos, asin, sqrt

TEMP = os.environ.get('LOCALAPPDATA', r'C:\Users\armag\AppData\Local') + r'\Temp'
snap = json.load(open(TEMP + r'\prod-891.json', encoding='utf-8'))
cards = snap['cards']
byid = {}
for c in cards:
    byid[str(c.get('id', ''))[:8]] = c
print('снапшот:', len(cards), 'карточек, gen', snap.get('generated_at'))
print('поля карточки:', sorted(cards[0].keys()))

# пары из dupes-822
txt = open(r'C:\Users\armag\projects\events-map\dots\events\dupes-822-apply.mjs', encoding='utf-8').read()
pairs = re.findall(r"canon:\s*'([0-9a-f-]{36})',\s*copy:\s*'([0-9a-f-]{36})'", txt)
print('пар в dupes-822:', len(pairs))

def hav(a, b, c, d):
    if None in (a, b, c, d): return None
    a, b, c, d = map(radians, (a, b, c, d))
    return 2 * 6371 * asin(sqrt(sin((c-a)/2)**2 + cos(a)*cos(c)*sin((d-b)/2)**2))

def rich(c):
    s = 0
    if c.get('start_time'): s += 1
    if c.get('description') and len(c['description']) > 40: s += 1
    if c.get('photo') or c.get('image') or c.get('photo_url'): s += 1
    if c.get('address') and len(c['address']) > 10: s += 1
    if c.get('website'): s += 1
    return s

missing, poorer, pindiff, ok = [], [], [], 0
for cn, cp in pairs:
    a, b = byid.get(cn[:8]), byid.get(cp[:8])
    if not a or not b:
        missing.append((cn[:8], cp[:8], 'нет в снапшоте')); continue
    issues = []
    if a.get('start_time') is None and b.get('start_time'):
        issues.append('у канона нет времени, у копии %s' % b['start_time'])
    if (a.get('description') or '') == '' and (b.get('description') or '') != '':
        issues.append('у канона нет описания')
    d = hav(a.get('lat'), a.get('lng'), b.get('lat'), b.get('lng'))
    if d is not None and d > 1.5:
        pindiff.append((cn[:8], cp[:8], round(d, 1)))
    if rich(b) > rich(a) + 1:
        issues.append('копия богаче: %d vs %d' % (rich(b), rich(a)))
    if issues:
        poorer.append((cn[:8], cp[:8], a.get('title', '')[:45], issues))
    else:
        ok += 1

print('нет в снапшоте:', len(missing), missing[:5])
print('канон НЕ ХУЖЕ копии:', ok)
print('канон беднее копии:', len(poorer))
for r in poorer:
    print('  ', r[0], '<-', r[1], '|', r[2], '|', '; '.join(r[3]))
print('пины пары разошлись >1.5 км:', len(pindiff), pindiff[:5])
