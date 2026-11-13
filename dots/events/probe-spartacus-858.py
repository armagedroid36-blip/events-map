import json, os
T = os.environ.get('LOCALAPPDATA', '') + r'\Temp'
snap = json.load(open(T + r'\prod-858.json', encoding='utf-8'))
cards = snap.get('cards') or []
print('cards:', len(cards), 'gen:', snap.get('generated_at'))

def g(c, *keys):
    vals = []
    for k in keys:
        v = c.get(k)
        if v:
            vals.append(str(v))
    return ' | '.join(vals)

needles = ('спартак', 'spartacus')
print('--- snapshot: Spartacus ---')
for c in cards:
    names = ' '.join(str(c.get(k) or '') for k in ('title', 'title_ru', 'title_en')).lower()
    if any(n in names for n in needles):
        print(c.get('id', '')[:8], '|', c.get('start_date'), c.get('start_time'), '->', c.get('end_date'), c.get('end_time'),
              '|', c.get('city'), '|', c.get('address'), '|', c.get('lat'), c.get('lng'))
        print('   ', g(c, 'title', 'title_ru', 'title_en'))
        print('    website:', c.get('website'))

print()
print('--- CN feed ?q=spartacus ---')
cn = json.load(open(T + r'\cn-spartacus-858.json', encoding='utf-8'))
evs = cn.get('events') or []
for e in evs:
    v = e.get('venue') or {}
    print(e.get('slug'), '|', e.get('start_at'), '->', e.get('end_at'), '| series:', e.get('series_count'), e.get('series_first'), e.get('series_last'))
    print('   venue:', v.get('name'), '| city:', v.get('city'), '|', v.get('lat'), v.get('lng'))
