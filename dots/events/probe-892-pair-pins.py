import json, re, os
from math import radians, sin, cos, asin, sqrt

TEMP = os.environ.get('LOCALAPPDATA', r'C:\Users\armag\AppData\Local') + r'\Temp'
snap = json.load(open(TEMP + r'\prod-891.json', encoding='utf-8'))
byid = {str(c['id'])[:8]: c for c in snap['cards']}
txt = open(r'C:\Users\armag\projects\events-map\dots\events\dupes-822-apply.mjs', encoding='utf-8').read()
pairs = re.findall(r"canon:\s*'([0-9a-f-]{36})',\s*copy:\s*'([0-9a-f-]{36})'", txt)

def hav(a, b, c, d):
    if None in (a, b, c, d): return 0
    a, b, c, d = map(radians, (a, b, c, d))
    return 2 * 6371 * asin(sqrt(sin((c-a)/2)**2 + cos(a)*cos(c)*sin((d-b)/2)**2))

def show(c):
    return '%-42s %s %s %s | %s | %.4f,%.4f' % (
        (c.get('title') or '')[:42], c.get('start_date'), c.get('start_time') or '--:--',
        c.get('end_date') or '', (c.get('address') or '')[:34], c.get('lat') or 0, c.get('lng') or 0)

for cn, cp in pairs:
    a, b = byid[cn[:8]], byid[cp[:8]]
    d = hav(a.get('lat'), a.get('lng'), b.get('lat'), b.get('lng'))
    if d <= 1.5: continue
    print('=== %s / %s  дистанция %.1f км' % (cn[:8], cp[:8], d))
    print('  KANON:', show(a))
    print('  COPY :', show(b))
