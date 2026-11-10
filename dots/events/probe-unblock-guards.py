#!/usr/bin/env python3
# Запуск 846: ПРЕФЛАЙТ пост-разблокировочной цепочки — сверка GUARD-условий apply-скриптов
# с ЖИВЫМ прод-снапшотом (prod-845.json). Зонд 845 проверял только существование id;
# здесь проверяется то, на чём скрипты МОЛЧА уходят в SKIP при APPLY: старая дата/время/
# конец/пин/активность должны совпадать с тем, что лежит в строке.
# Офлайн, без БД (REST 402).
import json, os, re, sys, glob

TEMP = os.environ.get('LOCALAPPDATA', r'C:\Users\armag\AppData\Local') + r'\Temp'
SNAP = os.path.join(TEMP, 'prod-845.json')
if not os.path.exists(SNAP):
    cand = sorted(glob.glob(os.path.join(TEMP, 'prod-84*.json')))
    SNAP = cand[-1] if cand else None
if not SNAP:
    sys.exit('нет снапшота')
data = json.load(open(SNAP, encoding='utf-8'))
cards = data['cards'] if isinstance(data, dict) else data
by_prefix = {}
for c in cards:
    by_prefix.setdefault(c['id'][:8], []).append(c)

REPO = r'C:\Users\armag\projects\events-map\dots\events'
HERMES = os.path.join(os.environ.get('LOCALAPPDATA', r'C:\Users\armag\AppData\Local'), 'hermes', 'dots', 'events')

def src(p):
    return open(p, encoding='utf-8').read()

def rows(prefix):
    r = by_prefix.get(prefix, [])
    if len(r) != 1:
        return None
    return r[0]

problems = []
far = []
report = []

def check(script, cond, msg):
    if not cond:
        problems.append(f'{script}: {msg}')

# ---- 1. dupes-822: пары canon/copy ----
s = src(os.path.join(HERMES, 'dupes-822-apply.mjs'))
pairs = re.findall(r"\{ canon: '([0-9a-f-]{36})', copy: '([0-9a-f-]{36})'(.*?)why:", s, re.S)
npairs = 0
for canon, copy, mid in pairs:
    npairs += 1
    date_shift = 'dateShift: true' in mid
    c, k = rows(canon[:8]), rows(copy[:8])
    if not c or not k:
        problems.append(f'dupes: пары {copy[:8]} нет в снапшоте'); continue
    if c['start_date'] != k['start_date']:
        dd = (json_d := None)  # noqa
        from datetime import date
        d1 = date.fromisoformat(c['start_date']); d2 = date.fromisoformat(k['start_date'])
        diff = abs((d2 - d1).days)
        check('dupes', date_shift and diff == 1,
              f'{copy[:8]}: даты расходятся {c["start_date"]}/{k["start_date"]} (dateShift={date_shift}) — уйдёт в SKIP')
    if not c.get('lat') or not k.get('lat'):
        problems.append(f'dupes: {copy[:8]} без координат')
    else:
        import math
        dx = (c['lat'] - k['lat']) * 111320
        dy = (c['lng'] - k['lng']) * 111320 * math.cos(math.radians(c['lat']))
        d = math.hypot(dx, dy)
        if d > 3000:
            # дистанция НЕ guard в скрипте (он только печатает Δ) — известный класс
            # «копия стоит на битом пине», такие пары в списке намеренно
            far.append(f'{copy[:8]} Δ={d:.0f} м от канона {canon[:8]}')
report.append(f'dupes-822: пар {npairs}')

# ---- 2. endtime-835: id/date/old -> end_time null ----
s = src(os.path.join(REPO, 'endtime-835-apply.mjs'))
n = 0
for pid, d, old in re.findall(r"\{ id: '([0-9a-f]{8})', date: '([0-9-]+)', old: '([0-9:]+)'", s):
    n += 1
    r = rows(pid)
    if not r:
        problems.append(f'endtime-835: {pid} нет в снапшоте'); continue
    check('endtime-835', r['start_date'] == d, f'{pid}: start_date {r["start_date"]} != {d} — SKIP')
    check('endtime-835', (r.get('end_time') or '') == old, f'{pid}: end_time {r.get("end_time")} != {old} — SKIP')
    check('endtime-835', r.get('end_date') == r.get('start_date'), f'{pid}: end_date {r.get("end_date")} != start_date (страховка «однодневная»)')
    if r.get('start_time') and r.get('end_time') and r['start_time'] < r['end_time']:
        problems.append(f'endtime-835: {pid}: end_time уже ПОСЛЕ start_time ({r["start_time"]}→{r["end_time"]}) — правило не сработает')
report.append(f'endtime-835: правок {n}')

# ---- 3. endtime-840: date/startTime/old/next (+nextEndDate) ----
s = src(os.path.join(REPO, 'endtime-840-apply.mjs'))
blocks = re.findall(r"\{\s*(?://[^\n]*\n\s*)*id: '([0-9a-f]{8})', date: '([0-9-]+)', startTime: '([0-9:]+)', old: '([0-9:]+)', next: '([0-9:]+)',(.*?)\}", s, re.S)
n = 0
for pid, d, st, old, nxt, tail in blocks:
    n += 1
    r = rows(pid)
    if not r:
        problems.append(f'endtime-840: {pid} нет в снапшоте'); continue
    check('endtime-840', r['start_date'] == d, f'{pid}: start_date {r["start_date"]} != {d} — SKIP')
    check('endtime-840', (r.get('start_time') or '') == st, f'{pid}: start_time {r.get("start_time")} != {st} — SKIP')
    check('endtime-840', (r.get('end_time') or '') == old, f'{pid}: end_time {r.get("end_time")} != {old} — SKIP')
    # nextEndDate — НОВОЕ значение, а не старое: гейтом не является (скрипт сверяет только end_time)
report.append(f'endtime-840: правок {n}')

# ---- 4. addams-842: id/titleLike/date/oldEnd/startTime ----
s = src(os.path.join(REPO, 'serie-addams-842-apply.mjs'))
n = 0
for pid, tl, d, oe, st in re.findall(r"id: '([0-9a-f]{8})', titleLike: '([^']+)',\s*date: '([0-9-]+)', oldEnd: '([0-9-]+)', startTime: '([0-9:]+)'", s):
    n += 1
    r = rows(pid)
    if not r:
        problems.append(f'addams-842: {pid} нет в снапшоте'); continue
    check('addams-842', r['start_date'] == d, f'{pid}: start_date {r["start_date"]} != {d} — SKIP')
    check('addams-842', r.get('end_date') == oe, f'{pid}: end_date {r.get("end_date")} != {oe} — SKIP')
    check('addams-842', (r.get('start_time') or '') == st, f'{pid}: start_time {r.get("start_time")} != {st} — SKIP')
    check('addams-842', tl in (r.get('title') or ''), f'{pid}: title не содержит «{tl}»')
report.append(f'addams-842: правок {n}')

# ---- 5. pins-826: id/from.lat,lng ----
s = src(os.path.join(HERMES, 'pins-826-apply.mjs'))
n = 0
for pid, flat, flng in re.findall(r"id: '([0-9a-f-]{36})',[^}]*?from: \{ lat: ([0-9.]+), lng: ([0-9.]+) \}", s):
    n += 1
    r = rows(pid[:8])
    if not r:
        problems.append(f'pins-826: {pid[:8]} нет в снапшоте'); continue
    check('pins-826', abs((r.get('lat') or 0) - float(flat)) < 1e-6 and abs((r.get('lng') or 0) - float(flng)) < 1e-6,
          f'{pid[:8]}: пин в снапшоте {r.get("lat")},{r.get("lng")} != from {flat},{flng} — SKIP')
report.append(f'pins-826: правок {n}')

# ---- 6. aggregate-843: agg/start/end + keep ----
s = src(os.path.join(REPO, 'aggregate-run-843-apply.mjs'))
n = 0
for pid, st_, en in re.findall(r"agg: '([0-9a-f-]{36})',[^}]*?start: '([0-9-]+)', end: '([0-9-]+)'", s, re.S):
    n += 1
    r = rows(pid[:8])
    if not r:
        problems.append(f'aggregate-843: {pid[:8]} нет в снапшоте'); continue
    check('aggregate-843', r['start_date'] == st_, f'{pid[:8]}: start_date {r["start_date"]} != {st_}')
    check('aggregate-843', r.get('end_date') == en, f'{pid[:8]}: end_date {r.get("end_date")} != {en} — SKIP')
    check('aggregate-843', (r.get('end_date') or '') > (r.get('start_date') or ''), f'{pid[:8]}: интервала нет — архивировать агрегат не за что')
keeps = re.findall(r"keep: \[([^\]]*)\]", s)
nkeep = sum(len(re.findall(r"'[0-9a-f-]{36}'", k)) for k in keeps)
missing_keep = [u[:8] for k in keeps for u in re.findall(r"'([0-9a-f-]{36})'", k) if not rows(u[:8])]
if missing_keep:
    problems.append(f'aggregate-843: карточек-окон нет в снапшоте — {missing_keep}')
report.append(f'aggregate-843: агрегатов {n}, окон-страховок {nkeep}')

print(f'снапшот: {os.path.basename(SNAP)} — карточек {len(cards)}')
for line in report:
    print('  ' + line)
print(f'пар-копий на битом пине (Δ>3 км, к скрипту претензий нет): {len(far)}')
for f in far:
    print('  ~ ' + f)
print(f'ГЕЙТОВ, КОТОРЫЕ ДАДУТ SKIP: {len(problems)}')
for p in problems:
    print('  ! ' + p)
