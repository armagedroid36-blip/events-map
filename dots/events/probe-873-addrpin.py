import json, math, os, re, unicodedata, collections, html

p = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'prod-873.json')
d = json.load(open(p, encoding='utf-8'))
cards = d['cards']
print('снапшот:', len(cards), 'карточек, generated_at', d.get('generated_at'))


def norm_addr(a):
    a = html.unescape(a or '').lower()
    a = re.sub(r'\b(cyprus|кипр|кипра|balі|bali|vietnam|вьетнам)\b', ' ', a)
    a = re.sub(r'[^0-9a-zа-яё\u0370-\u03ff ]+', ' ', a)
    return ' '.join(a.split())


def hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


groups = collections.defaultdict(list)
for c in cards:
    a = norm_addr(c.get('address'))
    if len(a) < 8 or a in ('cyprus cyprus',):
        continue
    if c.get('lat') is None:
        continue
    groups[a].append(c)

out = []
for a, g in groups.items():
    if len(g) < 2:
        continue
    mx = 0
    pair = None
    for i in range(len(g)):
        for j in range(i + 1, len(g)):
            dd = hav((g[i]['lat'], g[i]['lng']), (g[j]['lat'], g[j]['lng']))
            if dd > mx:
                mx, pair = dd, (g[i], g[j])
    if mx > 1.5:
        out.append((mx, a, pair[0], pair[1]))

out.sort(reverse=True, key=lambda x: x[0])
print('групп по адресу:', len(groups), '| с расхождением точки >1.5 км:', len(out))
for mx, a, c1, c2 in out[:12]:
    print('---')
    print(f'{mx:.1f} км | адрес: {a[:60]}')
    for c in (c1, c2):
        print('  ', c['id'][:8], c.get('start_date'), c.get('start_time'), '|', (c.get('title') or '')[:55],
              '|', (c.get('city') or ''), '|', round(c['lat'], 5), round(c['lng'], 5))
