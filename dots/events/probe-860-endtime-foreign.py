import json, os, re, unicodedata
from collections import Counter

SNAP = os.environ['LOCALAPPDATA'] + '/Temp/prod-860.json'
cards = json.load(open(SNAP, encoding='utf-8'))['cards']

def toks(*ts):
    s = set()
    for t in ts:
        if not t: continue
        t = unicodedata.normalize('NFKC', str(t)).lower()
        for w in re.findall(r'[0-9a-zа-яё\u0370-\u03ff]{5,}', t):
            s.add(w)
    return s

df = Counter()
for c in cards: df.update(toks(c.get('title'), c.get('title_ru'), c.get('title_en')))
RARE = 5  # токен встречается не более чем у 5 карточек => различительный

def wset(c): return {w for w in toks(c.get('title'), c.get('title_ru'), c.get('title_en')) if df[w] <= RARE}
def dd(c,k):
    v=c.get(k); return str(v)[:10] if v else None
def tmin(t):
    m=re.match(r'^(\d{1,2}):(\d{2})', str(t or ''))
    return int(m.group(1))*60+int(m.group(2)) if m else None

single=[c for c in cards if dd(c,'start_date') and dd(c,'start_date')==dd(c,'end_date') and c.get('end_time') and c.get('start_time')]
cands=[c for c in single if (tmin(c['end_time']) or 0)-(tmin(c['start_time']) or 0) > 60]
out=[]
for c in cands:
    ws=wset(c)
    if not ws: continue
    et=tmin(c['end_time'])
    for o in cards:
        if o.get('id')==c.get('id'): continue
        if tmin(o.get('start_time'))!=et: continue
        if dd(o,'start_date')==dd(c,'start_date'): continue
        common=ws & wset(o)
        if not common: continue
        out.append({'id':c['id'][:8],'title':c.get('title'),'city':c.get('city'),
                    'slot':f"{dd(c,'start_date')} {c['start_time']}→{c['end_time']}",
                    'sib':o['id'][:8],'sib_title':o.get('title'),'sib_city':o.get('city'),
                    'sib_slot':f"{dd(o,'start_date')} {o.get('start_time')}",'common':sorted(common)})
print('кандидатов:', len(out))
for x in out: print(json.dumps(x, ensure_ascii=False))
json.dump(out, open(os.environ['LOCALAPPDATA']+'/Temp/leads-860c.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
