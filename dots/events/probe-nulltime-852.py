import json, re, itertools, os
p = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'prod-852.json')
d = json.load(open(p, encoding='utf-8'))
cards = d.get('cards') or d.get('events') or []
print('snapshot cards:', len(cards), 'generated_at:', d.get('generated_at'))

STOP = set('''the and for with from into this that 2026 2027 кипр cyprus nicosia limassol larnaca paphos
pattihio theatre theater театр концерт фестиваль festival show live party ночь night день day
christmas market ярмарка рождественский рождественская village деревня programme dates guide
event events музыка music concert comedy stand танцевальный dance workshop мастерская мастер
класс series серия тур tour gala performance спектакль премьера presented при поддержке'''.split())

def words(t):
    t = (t or '').lower()
    t = re.sub(r'[^0-9a-zа-яё\u0370-\u03ff ]+', ' ', t)
    return {w for w in t.split() if len(w) >= 4 and w not in STOP and not w.isdigit()}

def pin(c):
    return (c.get('lat') or c.get('lng')) and (float(c['lat']), float(c['lng']))

def dist(a, b):
    import math
    if not a or not b: return 999
    dy = (a[0]-b[0])*111.0
    dx = (a[1]-b[1])*111.0*0.87
    return math.hypot(dx, dy)*1000

groups = {}
for c in cards:
    if c.get('start_date') is None: continue
    pt = pin(c)
    if not pt: continue
    key = (c['start_date'], round(pt[0], 2), round(pt[1], 2))
    groups.setdefault(key, []).append(c)

leads = []
for key, items in groups.items():
    if len(items) < 2: continue
    for a, b in itertools.combinations(items, 2):
        if a.get('recurrence') or b.get('recurrence'): continue
        ta, tb = a.get('start_time'), b.get('start_time')
        if bool(ta) == bool(tb): continue  # нужен ровно один с временем
        if dist(pin(a), pin(b)) > 300: continue
        wa, wb = words(a.get('title')) | words(a.get('title_ru')) | words(a.get('title_en')), \
                 words(b.get('title')) | words(b.get('title_ru')) | words(b.get('title_en'))
        common = wa & wb
        if len(common) < 2: continue
        leads.append({
            'date': key[0],
            'a': {'id': a['id'][:8], 'title': a.get('title'), 'time': ta, 'city': a.get('city')},
            'b': {'id': b['id'][:8], 'title': b.get('title'), 'time': tb, 'city': b.get('city')},
            'dist_m': round(dist(pin(a), pin(b))),
            'common': sorted(common),
        })

print('leads:', len(leads))
out = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'leads-nulltime-852.json')
json.dump(leads, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('file:', out)
for l in leads[:40]:
    print(f"{l['date']} {l['dist_m']}м [{','.join(l['common'])}] {l['a']['id']} {l['a']['time'] or '—'} {l['a']['title'][:48]!r} | {l['b']['id']} {l['b']['time'] or '—'} {l['b']['title'][:48]!r}")
