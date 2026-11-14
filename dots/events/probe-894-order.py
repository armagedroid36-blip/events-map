import re, glob, os, json, collections

DOTS = os.path.expanduser("~/AppData/Local/hermes/dots/events")
REPO = os.path.expanduser("~/projects/events-map/dots/events")

# собираем файлы: repo приоритетнее по basename
files = {}
for d in (DOTS, REPO):
    for p in glob.glob(os.path.join(d, "*-apply.mjs")):
        files[os.path.basename(p)] = p

DUPE_ID = re.compile(r"['\"]([0-9a-f]{8})[0-9a-f-]{0,28}['\"]")
print("скриптов apply:", len(files))

# 1. dupes-822: пары canon/copy + canonEnd
dp = files.get("dupes-822-apply.mjs")
txt = open(dp, encoding="utf-8").read()
pairs = re.findall(r"canon:\s*'([0-9a-f-]{36})',\s*copy:\s*'([0-9a-f-]{36})'(.*)", txt)
copies = {c[:8] for _, c, _ in pairs}
canons = {k[:8] for k, _, _ in pairs}
canon_end = {k[:8] for k, _, rest in pairs if "canonEnd" in rest}
print(f"dupes-822: пар {len(pairs)}, канонов {len(canons)}, копий {len(copies)}, с canonEnd {len(canon_end)}")

# 2. цели остальных скриптов
targets = collections.defaultdict(set)   # id8 -> set(scripts)
for name, path in sorted(files.items()):
    if name == "dupes-822-apply.mjs":
        continue
    s = open(path, encoding="utf-8").read()
    # только блоки данных (всё до main-логики): грубо — весь файл, но отсекаем комментарии
    s2 = "\n".join(l for l in s.splitlines() if not l.strip().startswith("//"))
    for m in DUPE_ID.finditer(s2):
        targets[m.group(1)].add(name)

print("id-целей у прочих скриптов:", len(targets))

# 3. конфликты по строке
bad_copy = sorted(copies & set(targets))
bad_canon_end = sorted(canon_end & set(targets))
print("КОПИИ dupes-822, которые ещё и цель другого скрипта:", len(bad_copy), bad_copy)
print("КАНОНЫ с canonEnd, которые ещё и цель другого скрипта:", len(bad_canon_end), bad_canon_end)

# 4. общий id 1e3a9b12: поля, которые пишут скрипты
print("\n--- id 1e3a9b12 ---")
p = [x for x in pairs if x[0].startswith("1e3a9b12")]
print("в dupes-822 парой:", bool(p), "| canonEnd:", ("canonEnd" in p[0][2]) if p else None)
print("в других скриптах:", sorted(targets.get("1e3a9b12", [])))
