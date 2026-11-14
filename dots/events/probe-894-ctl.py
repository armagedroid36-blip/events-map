# КОНТРОЛЬ зонда 894: искусственно помечаем 3 копии dupes-822 как цели другого шага.
import re, glob, os, collections
DOTS = os.path.expanduser("~/AppData/Local/hermes/dots/events")
REPO = os.path.expanduser("~/projects/events-map/dots/events")
files = {}
for d in (DOTS, REPO):
    for p in glob.glob(os.path.join(d, "*-apply.mjs")):
        files[os.path.basename(p)] = p
txt = open(files["dupes-822-apply.mjs"], encoding="utf-8").read()
pairs = re.findall(r"canon:\s*'([0-9a-f-]{36})',\s*copy:\s*'([0-9a-f-]{36})'(.*)", txt)
copies = {c[:8] for _, c, _ in pairs}
ID = re.compile(r"['\"]([0-9a-f]{8})[0-9a-f-]{0,28}['\"]")
targets = collections.defaultdict(set)
for n, p in files.items():
    if n == "dupes-822-apply.mjs":
        continue
    s = "\n".join(l for l in open(p, encoding="utf-8").read().splitlines() if not l.strip().startswith("//"))
    for m in ID.finditer(s):
        targets[m.group(1)].add(n)
for i in list(sorted(copies))[:3]:
    targets[i].add("CTL-fake")
hit = copies.intersection(set(targets))
print("CTL: ожидалось 3 совпадения ->", len(hit), sorted(hit))
