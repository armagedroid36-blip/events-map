#!/usr/bin/env python3
"""Сенсор 1137: битые ВНУТРЕННИЕ ссылки на страницах mypins.site.

0 запросов к базе Supabase: только прод (sitemap + HTML + проверка ссылок).
Секции:
  A  контроль сенсора CASES (извлечение/нормализация ссылок + классификатор статуса)
  B  выборка страниц-источников (главная, посадочные, категорийные, детальные события из sitemap)
  C  извлечение внутренних ссылок, дедуп, кап
  D  проверка статусов (редиректы разворачиваются; финальный код — арбитр)
  E  вывод битых с указанием страниц-источников

Классы ответов: OK (200), REDIRECT->200 (норма), BROKEN (404/410/5xx),
NET (сеть/таймаут сенсора — НЕ дефект сайта, считается отдельно).
"""
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, urlunparse

BASE = "https://mypins.site"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

SKIP_EXT = (".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico",
            ".woff", ".woff2", ".xml", ".json", ".txt", ".pdf", ".mp4")
CAP_LINKS = 900


def fetch(url, timeout=15, read_limit=400_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru,en"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        body = r.read(read_limit)
        return r.getcode(), body.decode("utf-8", "replace")


def norm(href, page):
    """Нормализовать href относительно страницы; вернуть абсолютный URL или None."""
    if not href:
        return None
    h = href.strip()
    if not h or h.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    absu = urljoin(page, h)
    p = urlparse(absu)
    if p.scheme not in ("http", "https"):
        return None
    host = p.netloc.lower()
    if host.endswith("mypins.site") is False and host != "mypins.site":
        return None  # внешние не проверяем
    path = p.path or "/"
    low = path.lower()
    if low.endswith(SKIP_EXT):
        return None
    return urlunparse(("https", "mypins.site", path, "", p.query, ""))  # без #фрагмента


def classify(code, err=None):
    if err:
        return "NET"
    if 200 <= code < 300:
        return "OK"
    if 300 <= code < 400:
        return "BROKEN"  # после авто-перехода 3xx не должен оставаться
    return "BROKEN"


HREF_RE = re.compile(r'<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|\'([^\']*)\')', re.I)


def extract(html, page):
    out = []
    for m in HREF_RE.finditer(html):
        href = m.group(2) if m.group(2) is not None else m.group(3)
        u = norm(href, page)
        if u:
            out.append(u)
    return out


def check(url):
    try:
        code, _ = fetch(url, timeout=15)
        return url, code, None
    except urllib.error.HTTPError as e:
        return url, e.code, None
    except Exception as e:  # noqa: BLE001
        return url, 0, str(e)


# ---------- A. контроль сенсора ----------
CASES = [
    # (href, ожидаемая нормализация: True = внутренняя ссылка остаётся, False = отбрасывается)
    ("/bali/", True),
    ("event/abc/slug/", True),
    ("https://mypins.site/cyprus/", True),
    ("#top", False),
    ("mailto:a@b.c", False),
    ("tel:+357", False),
    ("javascript:void(0)", False),
    ("https://t.me/somechannel", False),
    ("https://yandex.ru/maps", False),
    ("/assets/app-DbvnpOXZ.js", False),
    ("/data/events.json", False),
    ("/bali/exhibition/#list", True),
]


def control():
    page = BASE + "/bali/"
    ok = 0
    fails = []
    for href, expect_internal in CASES:
        u = norm(href, page)
        got = u is not None
        if got == expect_internal:
            ok += 1
        else:
            fails.append((href, u))
    # фрагмент обязан исчезать, а хост приводиться к mypins.site
    u = norm("/bali/exhibition/#list", page)
    frag_ok = u is not None and "#" not in u and u.startswith("https://mypins.site/")
    if frag_ok:
        ok += 1
    else:
        fails.append(("fragment/absolute", u))
    # классификатор
    cls = [classify(200), classify(301), classify(404), classify(500), classify(0, "timeout")]
    expect = ["OK", "BROKEN", "BROKEN", "BROKEN", "NET"]
    if cls == expect:
        ok += 1
    else:
        fails.append(("classify", cls))
    total = len(CASES) + 2
    for f in fails:
        print("  CASES FAIL:", f)
    return ok, total


def sitemap_urls():
    try:
        code, xml = fetch(f"{BASE}/sitemap.xml?v={int(time.time())}", read_limit=3_000_000)
    except Exception as e:  # noqa: BLE001
        print("sitemap недоступен:", e)
        return []
    urls = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)
    return urls


def main():
    ok, total = control()
    print(f"A) КОНТРОЛЬ СЕНСОРА: {ok}/{total}")
    if ok < total:
        print("Сенсор не прошёл контроль — замер не засчитывается.")
        return 1

    sm = sitemap_urls()
    event_urls = [u for u in sm if "/event/" in u]
    print(f"B) sitemap: {len(sm)} URL, детальных событий {len(event_urls)}")
    rnd = random.Random(1137)
    pages = [BASE + "/", BASE + "/bali/", BASE + "/cyprus/", BASE + "/da-nang/",
             BASE + "/nha-trang/", BASE + "/bali/exhibition/", BASE + "/cyprus/festival/",
             BASE + "/en/bali/"]
    pages += rnd.sample(event_urls, min(6, len(event_urls)))

    sources = {}
    err_pages = []
    for p in pages:
        try:
            code, html = fetch(f"{p}?v={int(time.time())}")
        except Exception as e:  # noqa: BLE001
            err_pages.append((p, str(e)))
            continue
        if code != 200:
            err_pages.append((p, f"HTTP {code}"))
            continue
        for u in extract(html, p):
            sources.setdefault(u, set()).add(p)

    links = sorted(sources)
    checked = links[:CAP_LINKS]
    print(f"C) страниц прочитано {len(pages) - len(err_pages)}/{len(pages)}, "
          f"уникальных внутренних ссылок {len(links)}, проверяю {len(checked)}")

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=14) as ex:
        results = list(ex.map(check, checked))
    dt = time.time() - t0

    broken, nets, okc = [], [], 0
    for url, code, err in results:
        c = classify(code, err)
        if c == "OK":
            okc += 1
        elif c == "NET":
            nets.append((url, err))
        else:
            broken.append((url, code))

    print(f"D) проверено {len(results)} за {dt:.0f} с: OK {okc}, BROKEN {len(broken)}, NET {len(nets)}")
    for u, err in nets[:5]:
        print(f"  NET (сеть сенсора, не дефект): {u} — {err}")
    print("E) БИТЫЕ ССЫЛКИ:")
    if not broken:
        print("  нет")
    for u, code in broken:
        src = sorted(sources.get(u, []))[:3]
        print(f"  {code} {u}")
        for s in src:
            print(f"      <- {s}")
    if err_pages:
        print("  страницы-источники с ошибкой чтения:", err_pages)
    return 0


if __name__ == "__main__":
    sys.exit(main())
