# Зонд целостности дат/времени по прод-снапшоту (офлайн, без БД).
# Классы, которые прошлые зонды НЕ смотрели:
#  A) end_date < start_date (перевёрнутый интервал)
#  B) start_time = null, но end_time задан (конец без начала)
#  C) start_time вне формата HH:MM / часы > 23 / минуты > 59
#  D) end_date == start_date и end_time < start_time (дефект класса 835 — должен совпасть с 4 ожидающими правки)
#  E) end_date > start_date и end_time null (информационно: интервал без времени конца)
import json, sys, os, re

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('LOCALAPPDATA', '.'), 'Temp', 'prod-845.json')
data = json.load(open(path, encoding='utf-8'))
cards = data.get('cards') or data.get('events') or []
print(f"снапшот: {os.path.basename(path)}  карточек {len(cards)}  generated_at {data.get('generated_at')}")

T = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$')

def st(c, k):
    v = c.get(k)
    return v.strip() if isinstance(v, str) and v.strip() else None

A, B, C, D, E = [], [], [], [], []
ids = {}
for c in cards:
    i = c.get('id', '')
    ids[i] = ids.get(i, 0) + 1
    sd, ed = st(c, 'start_date'), st(c, 'end_date')
    s_t, e_t = st(c, 'start_time'), st(c, 'end_time')
    title = (c.get('title') or '')[:40]

    if sd and ed and ed < sd:
        A.append((i[:8], sd, ed, title))

    if not s_t and e_t:
        B.append((i[:8], c.get('start_date'), e_t, title))

    for val in (s_t, e_t):
        if val and not T.match(val):
            C.append((i[:8], val, title))
            break

    if s_t and e_t and sd and ed and ed == sd and e_t < s_t:
        D.append((i[:8], sd, s_t, e_t, title))

    if sd and ed and ed > sd and not e_t:
        E.append((i[:8], sd, ed, s_t, title))

dups = {k: v for k, v in ids.items() if v > 1}

print(f"\nA) end_date < start_date: {len(A)}")
for r in A[:10]:
    print('   ', r)
print(f"B) нет start_time, но есть end_time: {len(B)}")
for r in B[:10]:
    print('   ', r)
print(f"C) время вне формата: {len(C)}")
for r in C[:10]:
    print('   ', r)
print(f"D) однодневная карточка с end_time < start_time: {len(D)}  (ожидание: 4 из скрипта endtime-835)")
for r in sorted(D):
    print('   ', r)
print(f"E) интервал > 1 дня без end_time (норма, инфо): {len(E)}")
print(f"дублей id: {len(dups)}")

# сверка D с готовым списком правок endtime-835-apply.mjs
fix = os.path.expanduser('~/projects/events-map/dots/events/endtime-835-apply.mjs')
try:
    src = open(fix, encoding='utf-8').read()
    want = sorted(set(re.findall(r"id:\s*'([0-9a-f]{8})'", src)))
    got = sorted(x[0] for x in D)
    print(f"\nendtime-835-apply.mjs: целей {len(want)}; в снапшоте D {len(got)}")
    print("  совпадают:", want == got, "| нет в снапшоте:", [w for w in want if w not in got], "| лишние:", [g for g in got if g not in want])
except Exception as e:
    print("не прочитал endtime-835-apply.mjs:", e)
