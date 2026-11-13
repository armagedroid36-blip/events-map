#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Префлайт гейтов ВСЕЙ пост-разблокировочной цепочки (12 apply-шагов unblock.sh)
против живого прод-снапшота. Офлайн: база при 402 не нужна.

Для каждого блока-правки скрипта берём id (8-hex или uuid) и «старые» значения,
на которых скрипт уйдёт в молчаливый SKIP, и сверяем с карточкой снапшота.
NEW-значения (next/nextEnd/to/nextEndTime/patch) гейтами НЕ являются.
"""
import json, os, re, sys

TEMP = os.environ.get('LOCALAPPDATA', '') + '/Temp'
SNAP = os.path.join(TEMP, 'prod-861.json')
REPO = os.path.expanduser('~/projects/events-map/dots/events')
HERMES = os.path.expanduser('~/AppData/Local/hermes/dots/events')

SCRIPTS = [
    ('dupes-822-apply.mjs', REPO),
    ('pins-826-apply.mjs', HERMES),
    ('endtime-835-apply.mjs', REPO),
    ('endtime-840-apply.mjs', REPO),
    ('serie-addams-842-apply.mjs', REPO),
    ('aggregate-run-843-apply.mjs', REPO),
    ('memory-run-849-apply.mjs', REPO),
    ('monday-850-apply.mjs', REPO),
    ('cardcity-856-apply.mjs', REPO),
    ('tour-enddate-857-apply.mjs', REPO),
    ('spartacus30-pin-858-apply.mjs', REPO),
    ('nutcracker-859-apply.mjs', REPO),
]

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_RE = re.compile(r'^\d{2}:\d{2}(:\d{2})?$')
ID_RE = re.compile(r'^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$')
KV = re.compile(r"(\w+)\s*:\s*'([^']*)'")

snap = json.load(open(SNAP, encoding='utf-8'))
cards = snap['cards']
byid = {}
for c in cards:
    cid = str(c.get('id') or '')
    byid[cid] = c

# КОНТРОЛЬ «зонд не ослеп»: CTL=1 — портим по одному гейту у двух карточек и ждём ровно 2 расхождения
if os.environ.get('CTL') == '1':
    for c in cards:
        cid = str(c.get('id') or '')
        if cid.startswith('533926bd'):
            c['end_time'] = '19:00:00'
        if cid.startswith('24e8a3ec'):
            c['end_date'] = '2027-02-02'
    print('КОНТРОЛЬ: у 533926bd end_time → 19:00, у 24e8a3ec end_date → 2027-02-02 (ждём 2 расхождения)')

def find(prefix):
    hits = [c for cid, c in byid.items() if cid.startswith(prefix)]
    return hits

def norm(v):
    if v is None:
        return ''
    s = str(v)
    return s[:5] if TIME_RE.match(s) else s

def blocks(text):
    # блоки-правки: считаем фигурные скобки — формат блоков у скриптов разный
    out = []
    cur = None
    depth = 0
    for line in text.splitlines():
        s = line.strip()
        if cur is None:
            if s.startswith('{') and not s.startswith('{ apikey') and 'Bearer' not in s:
                cur = line
                depth = s.count('{') - s.count('}')
                if depth <= 0:
                    out.append(cur)
                    cur = None
            continue
        cur += '\n' + line
        depth += s.count('{') - s.count('}')
        if depth <= 0:
            out.append(cur)
            cur = None
            depth = 0
    if cur:
        out.append(cur)
    return out

summary = []
problems = []
for name, d in SCRIPTS:
    p = os.path.join(d, name)
    if not os.path.exists(p):
        problems.append(f'{name}: ФАЙЛ НЕ НАЙДЕН ({p})')
        continue
    text = open(p, encoding='utf-8').read()
    bl = blocks(text)
    n_ids = n_ok = n_miss = 0
    hard = soft = n_gates = 0
    for b in bl:
        kv = dict(KV.findall(b))
        ids = [v for k, v in kv.items() if k in ('id', 'canon', 'copy', 'agg') and ID_RE.match(v)]
        # id-массивы (aggregate keep / ids)
        ids += [m for m in re.findall(r"'([0-9a-f]{8}-[0-9a-f-]{27})'", b) if m not in ids]
        if not ids:
            continue
        base = None
        for i in ids:
            n_ids += 1
            hits = find(i)
            if not hits:
                n_miss += 1
                problems.append(f'{name}: id {i[:8]} НЕТ в снапшоте')
                continue
            n_ok += 1
            if base is None:
                base = hits[0]
        if base is None:
            continue
        # гейты по полям
        for k, v in kv.items():
            if not v:
                continue
            if ((k in ('start', 'date', 'end', 'fromEnd', 'oldEnd') and (DATE_RE.match(v) or TIME_RE.match(v)))
                    or k in ('startTime', 'old', 'fromCity', 'title', 'titleLike')):
                n_gates += 1
            if k in ('start', 'date') and DATE_RE.match(v):
                if base.get('start_date') != v:
                    hard += 1
                    problems.append(f'{name} {base["id"][:8]}: гейт start_date {v} ≠ снапшот {base.get("start_date")}')
            elif k in ('end', 'fromEnd', 'oldEnd') and DATE_RE.match(v):
                if base.get('end_date') != v:
                    hard += 1
                    problems.append(f'{name} {base["id"][:8]}: гейт end_date {v} ≠ снапшот {base.get("end_date")}')
            elif k == 'startTime' and TIME_RE.match(v):
                if norm(base.get('start_time')) != norm(v):
                    hard += 1
                    problems.append(f'{name} {base["id"][:8]}: гейт start_time {v} ≠ снапшот {base.get("start_time")}')
            elif k in ('old', 'oldEnd') and TIME_RE.match(v):
                if norm(base.get('end_time')) != norm(v):
                    hard += 1
                    problems.append(f'{name} {base["id"][:8]}: гейт end_time {v} ≠ снапшот {base.get("end_time")}')
            elif k in ('fromCity',):
                if base.get('city') != v:
                    hard += 1
                    problems.append(f'{name} {base["id"][:8]}: гейт city {v} ≠ снапшот {base.get("city")}')
            elif k in ('title', 'titleLike'):
                t = base.get('title') or ''
                if v.lower()[:12] not in t.lower():
                    soft += 1
                    problems.append(f'{name} {base["id"][:8]}: SOFT заголовок «{v[:28]}» vs «{t[:40]}»')
        # пины from.lat/from.lng
        fm = re.search(r"from\s*:\s*\{\s*lat:\s*([\d.]+),\s*lng:\s*([\d.]+)", b, re.S)
        if fm:
            n_gates += 1
            la, ln = float(fm.group(1)), float(fm.group(2))
            if abs((base.get('lat') or 0) - la) > 1e-6 or abs((base.get('lng') or 0) - ln) > 1e-6:
                hard += 1
                problems.append(f'{name} {base["id"][:8]}: гейт пина {la},{ln} ≠ снапшот {base.get("lat")},{base.get("lng")}')
    summary.append((name, len(bl), n_ids, n_ok, n_miss, hard, soft, n_gates))

print(f'снапшот: {snap.get("count")} карточек, gen {snap.get("generated_at")}')
print(f'{"скрипт":34} {"блоков":>6} {"id":>4} {"есть":>5} {"нет":>4} {"гейтов":>7} {"гейт!":>6} {"soft":>5}')
tot = [0, 0, 0, 0, 0, 0]
for name, nb, ni, ok, miss, hard, soft, ng in summary:
    print(f'{name:34} {nb:6} {ni:4} {ok:5} {miss:4} {ng:7} {hard:6} {soft:5}')
    for i, x in enumerate((ni, ok, miss, ng, hard, soft)):
        tot[i] += x
print(f'{"ИТОГО":34} {"":6} {tot[0]:4} {tot[1]:5} {tot[2]:4} {tot[3]:7} {tot[4]:6} {tot[5]:5}')
print()
if problems:
    print('РАСХОЖДЕНИЯ:')
    for p in problems:
        print(' -', p)
else:
    print('Расхождений нет: все гейты совпадают со снапшотом, SKIP-ов не будет.')
