import json, re, collections, os

p = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'prod-844.json')
data = json.load(open(p, encoding='utf-8'))
cards = data['cards'] if isinstance(data, dict) else data
print('карточек:', len(cards), 'gen:', data.get('generated_at') if isinstance(data, dict) else '?')

def norm(s):
    s = (s or '').lower()
    s = re.sub(r'[^\wа-яё\u0370-\u03ff]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def is_rec(c):
    r = c.get('recurrence')
    return bool(r) and r not in ({}, None, 'null')

groups = collections.defaultdict(list)
for c in cards:
    if is_rec(c):
        continue
    t = norm(c.get('title'))
    if len(t) < 6:
        continue
    groups[(t, c.get('city') or '')].append(c)

def mode(vals):
    vals = [v for v in vals if v]
    if not vals:
        return None, 0
    cnt = collections.Counter(vals)
    v, n = cnt.most_common(1)[0]
    return v, n

leads = []
for key, g in groups.items():
    if len(g) < 3:
        continue
    st_mode, st_n = mode([c.get('start_time') for c in g])
    et_mode, et_n = mode([c.get('end_time') for c in g if c.get('end_time') and c.get('end_time') != c.get('start_time')])
    for c in g:
        single = c.get('end_date') == c.get('start_date')
        st = c.get('start_time')
        et = c.get('end_time')
        bad = []
        if single and st_mode and st_n >= 2 and st and st != st_mode:
            bad.append(('start', st, st_mode, st_n))
        if single and et_mode and et_n >= 2 and et and et != et_mode and et != st:
            bad.append(('end', et, et_mode, et_n))
        if bad:
            leads.append({
                'id': c['id'][:8], 'title': c.get('title'), 'date': c.get('start_date'),
                'end': c.get('end_date'), 'st': st, 'et': et, 'addr': (c.get('address') or '')[:60],
                'city': c.get('city'), 'group_size': len(g), 'bad': bad,
            })

print('групп >=3:', sum(1 for g in groups.values() if len(g) >= 3))
print('лидов:', len(leads))
for l in sorted(leads, key=lambda x: x['date'] or ''):
    print(f"{l['id']} | {l['date']}->{l['end']} | {l['st']}->{l['et']} | {l['title'][:55]} | {l['city']} | grp {l['group_size']} | {l['bad']}")
