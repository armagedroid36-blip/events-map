"""Фикстура гейта sitemap: посадочная-алиас (canonical в sitemap) = (A), не потеря.

CASE 1: выпали две посадочные, чей canonical ведёт на /bali/, а /bali/ остался в карте
        => объяснено, «0 необъяснимых», код 0.
CASE 2 (контроль): тот же набор, но /bali/ выпал из карты
        => эти же две посадочные становятся (B), «2 необъяснимых» (гейт не глушит потерю).
"""
import os, shutil, subprocess, sys, uuid

REPO = r"C:\Users\armag\projects\events-map"
SCRIPT = os.path.join(REPO, "scripts", "verify-sitemap-shrink.mjs")
BASE = r"C:\Users\armag\AppData\Local\Temp\gate-canon"
SITE = "https://mypins.site"


def write(p, text):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def page(canonical, noindex=False):
    robots = '<meta name="robots" content="noindex, follow" />' if noindex else ""
    return f'<html><head><link rel="canonical" href="{canonical}" />{robots}</head><body>x</body></html>'


def build(case, keep_parent):
    root = os.path.join(BASE, case)
    shutil.rmtree(root, ignore_errors=True)
    dist = os.path.join(root, "dist")
    kept = [f"{SITE}/blog/post{i}/" for i in range(117)]
    if keep_parent:
        kept.append(f"{SITE}/bali/")
    dropped = [f"{SITE}/bali/festival/", f"{SITE}/en/bali/wellness/"]
    write(os.path.join(dist, "sitemap.xml"),
          '<urlset>' + "".join(f"<url><loc>{u}</loc></url>" for u in kept) + "</urlset>")
    prev = os.path.join(root, "prev-sitemap.xml")
    write(prev, '<urlset>' + "".join(f"<url><loc>{u}</loc></url>" for u in kept + dropped) + "</urlset>")
    write(os.path.join(dist, "bali", "festival", "index.html"), page(f"{SITE}/bali/"))
    write(os.path.join(dist, "en", "bali", "wellness", "index.html"), page(f"{SITE}/bali/"))
    env = dict(os.environ, SITEMAP_DIST=dist, PREV_SITEMAP=prev)
    r = subprocess.run(["node", SCRIPT], cwd=REPO, env=env, capture_output=True, text=True)
    return r


ok = True
r1 = build("case1", True)
out1 = (r1.stdout + r1.stderr)
c1 = r1.returncode == 0 and "0 необъяснимых" in out1 and "2 посадочная-алиас канона" in out1
print("CASE 1 (canonical в sitemap) -> код", r1.returncode, "| ok" if c1 else "| FAIL")
print("   ", [l for l in out1.splitlines() if "loc," in l or "объяснено" in l])
ok &= c1

r2 = build("case2", False)
out2 = (r2.stdout + r2.stderr)
c2 = "необъяснимых), " in out2 and " 2 необъяснимых" in out2.replace("2 необъяснимых),", "2 необъяснимых")
c2 = c2 or ("2 необъяснимых" in out2)
print("CASE 2 (контроль: canonical вне карты) -> код", r2.returncode, "| ok" if c2 else "| FAIL")
print("   ", [l for l in out2.splitlines() if "loc," in l or "НЕОБЪЯСНИМОЕ" in l or "необъяснимых" in l][:4])
ok &= c2

print("ИТОГ:", "OK 2/2" if ok else "ЕСТЬ ПАДЕНИЯ")
sys.exit(0 if ok else 1)
