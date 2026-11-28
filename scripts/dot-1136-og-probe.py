#!/usr/bin/env python3
"""dot-1136: сенсор соцпревью (Open Graph / Twitter) детальных страниц событий.

Класс: «ссылка на событие в мессенджере/соцсети даёт пустую или битую карточку».
Проверяем на выборке страниц из sitemap (0 запросов к базе):
  A) og:title есть, непустой и не равен названию сайта;
  B) og:description есть и непустой;
  C) og:image есть; картинка отдаётся 200, content-type image/*, размер >= 8000 Б
     (меньше — заглушка/битая), плюс поиск ОДНОЙ картинки у РАЗНЫХ событий (заглушка);
  D) og:url совпадает с canonical страницы;
  E) twitter:card + og:type (информационно).

Встроенный контроль CASES: синтетические HTML и туплы картинок, которые обязаны
срабатывать и молчать. Без контроля «дефектов 0» результатом не считается.
"""
import hashlib
import random
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SITE = "https://mypins.site"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
SAMPLE = 30
SEED = 1136
MIN_IMG = 8000
LOGO = SITE + "/logo.png"          # штатный фолбэк og:image у события БЕЗ фото
SITE_NAME_HINTS = {"события на карте", "mypins.site", "events map", "events on the map"}
UUID = re.compile(r"/event/([0-9a-f-]{36})/")


def get(url, tries=3, binary=False):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept-Language": "ru,en;q=0.8"})
            with urllib.request.urlopen(req, timeout=25) as r:
                body = r.read()
                if binary:
                    return r.status, r.headers.get("Content-Type", ""), body
                return r.geturl(), body.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if binary:
                return e.code, e.headers.get("Content-Type", ""), b""
            if i == tries - 1:
                return url, "ERR:HTTP %s" % e.code
            time.sleep(1.0)
        except Exception as e:
            if binary:
                if i == tries - 1:
                    return 0, "ERR:%s" % e, b""
                time.sleep(2.0)
                continue
            if i == tries - 1:
                return url, "ERR:%s" % e
            time.sleep(1.5)


META = re.compile(r"<meta\b[^>]*>", re.I)
PROP = re.compile(r'(?:property|name)\s*=\s*"([^"]*)"', re.I)
CONTENT = re.compile(r'content\s*=\s*"([^"]*)"', re.I)
LINK = re.compile(r"<link\b[^>]*>", re.I)
ATTR = re.compile(r'(\w[\w:-]*)\s*=\s*"([^"]*)"')


def parse_meta(html):
    """-> {key: content} по property и name (og:*, twitter:*)"""
    out = {}
    for tag in META.findall(html):
        k = PROP.search(tag)
        c = CONTENT.search(tag)
        if k and c:
            out[k.group(1).lower()] = c.group(1).strip()
    return out


def parse_canonical(html):
    for tag in LINK.findall(html):
        a = dict(ATTR.findall(tag))
        if "canonical" in (a.get("rel") or "").lower().split():
            return a.get("href") or ""
    return None


def norm(u):
    u = (u or "").strip().split("#")[0].split("?")[0]
    if u.startswith("/"):
        u = SITE + u
    return u.rstrip("/") + "/"


def abs_url(u):
    if not u:
        return ""
    u = u.strip()
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("/"):
        return SITE + u
    return u


def tag_checks(url, html):
    """Проверки по HTML (без сети). -> (bad[], meta)"""
    m = parse_meta(html)
    bad = []
    title = m.get("og:title", "")
    if not title:
        bad.append("нет og:title")
    elif title.strip().lower() in SITE_NAME_HINTS:
        bad.append("og:title = название сайта, а не события")
    desc = m.get("og:description", "")
    if not desc:
        bad.append("нет og:description")
    img = m.get("og:image", "")
    if not img:
        bad.append("нет og:image")
    ogurl = m.get("og:url", "")
    canon = parse_canonical(html)
    if not ogurl:
        bad.append("нет og:url")
    elif canon is not None and norm(ogurl) != norm(canon):
        bad.append("og:url != canonical (%s vs %s)" % (norm(ogurl), norm(canon)))
    return bad, m


def img_verdict(status, ctype, size):
    if status != 200:
        return "картинка не отдалась (HTTP %s)" % status
    if "image" not in (ctype or "").lower():
        return "content-type не картинка (%s)" % (ctype or "пусто")
    if size < MIN_IMG:
        return "картинка-заглушка/обрезана (%d Б)" % size
    return None


def selftest():
    page = ('<meta property="og:title" content="Kecak Dance at Ubud Palace">'
            '<meta property="og:description" content="Танцевальное шоу, Убуд, 3 декабря">'
            '<meta property="og:image" content="https://cdn.example/e.webp">'
            '<meta property="og:url" content="%s/event/abc/">'
            '<meta property="og:type" content="article">'
            '<meta name="twitter:card" content="summary_large_image">'
            '<link rel="canonical" href="%s/event/abc/">') % (SITE, SITE)
    cases = []
    cases.append(("здоровая страница", page, 0))
    cases.append(("нет og:image", page.replace('<meta property="og:image" content="https://cdn.example/e.webp">', ""), 1))
    cases.append(("нет og:title", page.replace('content="Kecak Dance at Ubud Palace"', 'content=""'), 1))
    cases.append(("og:title = сайт", page.replace('content="Kecak Dance at Ubud Palace"', 'content="События на карте"'), 1))
    cases.append(("нет og:description", page.replace('content="Танцевальное шоу, Убуд, 3 декабря"', 'content="  "'), 1))
    cases.append(("нет og:url", page.replace('<meta property="og:url" content="%s/event/abc/">' % SITE, ""), 1))
    cases.append(("og:url на чужую страницу",
                  page.replace('content="%s/event/abc/"' % SITE, 'content="%s/event/zzz/"' % SITE), 1))
    cases.append(("относительный og:image — норма", page.replace("https://cdn.example/e.webp", "/images/e.webp"), 0))
    cases.append(("name= вместо property — норма",
                  page.replace('<meta property="og:title"', '<meta name="og:title"'), 0))
    cases.append(("без canonical — og:url не сверять",
                  page.replace('<link rel="canonical" href="%s/event/abc/">' % SITE, ""), 0))

    img_cases = [
        ("живая картинка", (200, "image/webp", 42000), 0),
        ("404", (404, "text/html", 0), 1),
        ("html вместо картинки", (200, "text/html", 20000), 1),
        ("заглушка 3.8 КБ", (200, "image/webp", 3856), 1),
        ("пустое тело 200", (200, "image/webp", 0), 1),
    ]
    ok = 0
    for name, html, want in cases:
        bad, _ = tag_checks(SITE + "/event/abc/", html)
        res = len(bad) == want
        ok += res
        print("  CASES %-38s ожид=%d факт=%d %s" % (name, want, len(bad), "OK" if res else "ПРОВАЛ: " + ";".join(bad)))
    for name, tup, want in img_cases:
        v = img_verdict(*tup)
        res = (v is not None) == bool(want)
        ok += res
        print("  CASES %-38s ожид=%d факт=%d %s" % ("img " + name, want, int(v is not None),
                                                    "OK" if res else "ПРОВАЛ: " + str(v)))
    total = len(cases) + len(img_cases)
    print("  КОНТРОЛЬ СЕНСОРА: %d/%d" % (ok, total))
    return ok == total, total


def main():
    t0 = time.time()
    print("A. КОНТРОЛЬ СЕНСОРА")
    good, ncases = selftest()

    _, sm = get(SITE + "/sitemap.xml?v=%d" % int(time.time()))
    if sm.startswith("ERR"):
        print("sitemap недоступен:", sm[:120])
        return 1
    urls = re.findall(r"<loc>([^<]+)</loc>", sm)
    events = [u for u in urls if "/event/" in u and UUID.search(u)]
    print("B. ИНВЕНТАРЬ: sitemap %d URL, детальных событий %d" % (len(urls), len(events)))

    random.seed(SEED)
    picks = random.sample(sorted(events), min(SAMPLE, len(events)))
    print("C. ВЫБОРКА %d страниц (seed %d)" % (len(picks), SEED))

    def one(u):
        got, html = get(u)
        if html.startswith("ERR"):
            return u, None, None, html
        bad, m = tag_checks(u, html)
        return u, bad, m, ""

    with ThreadPoolExecutor(max_workers=10) as ex:
        res = list(ex.map(one, picks))

    imgs = {}
    for u, bad, m, err in res:
        if not m:
            continue
        iu = abs_url(m.get("og:image", ""))
        if iu:
            imgs.setdefault(iu, []).append(u)

    def fetch_img(iu):
        st, ct, body = get(iu, binary=True)
        return iu, st, ct, len(body), hashlib.md5(body).hexdigest() if body else ""

    with ThreadPoolExecutor(max_workers=10) as ex:
        imgres = list(ex.map(fetch_img, list(imgs)))

    img_bad, stub_hash, unchecked = {}, {}, {}
    for iu, st, ct, size, h in imgres:
        if st == 0:
            # сеть САМОГО сенсора (urllib ↔ чужой CDN), не состояние картинки:
            # такие URL проверяются curl-ом вручную, в дефекты не идут.
            unchecked[iu] = ct
            continue
        v = img_verdict(st, ct, size)
        if v:
            img_bad[iu] = v
        elif size:
            stub_hash.setdefault(h, set()).update(imgs[iu])

    shared = {h: us for h, us in stub_hash.items() if len(us) >= 2}
    shared_urls = set()
    for us in shared.values():
        shared_urls |= us

    defective, errors, notes = [], [], {"twitter": 0, "ogtype": 0, "noimg": 0, "logo": 0, "photo": 0}
    for u, bad, m, err in res:
        if bad is None:
            errors.append((u, err))
            continue
        bad = list(bad)
        if m:
            if m.get("twitter:card"):
                notes["twitter"] += 1
            if m.get("og:type"):
                notes["ogtype"] += 1
            iu = abs_url(m.get("og:image", ""))
            if iu == LOGO:
                # штатный фолбэк: у события нет живого фото (прецедент «фото у CN»).
                # Дефект только если у события фото ЕСТЬ, а превью — логотип; без базы
                # это не проверить, поэтому считаем отдельно и в дефекты не пишем.
                notes["logo"] += 1
            elif iu in img_bad:
                bad.append(img_bad[iu])
                notes["noimg"] += 1
            elif u in shared_urls:
                bad.append("og:image — чужая картинка, общая у разных событий")
                notes["noimg"] += 1
            else:
                notes["photo"] += 1
        if bad:
            defective.append((u, bad))

    print("D. ПРОВЕРЕНО %d, ошибок сети %d" % (len(res) - len(errors), len(errors)))
    print("E. ИНФО: twitter:card у %d, og:type у %d; og:image — своё фото у %d, "
          "логотип-фолбэк у %d, проблем с картинкой у %d; не проверить сетью сенсора %d; "
          "общих картинок 2+ события: %d"
          % (notes["twitter"], notes["ogtype"], notes["photo"], notes["logo"],
             notes["noimg"], len(unchecked), len(shared)))
    for iu, err in list(unchecked.items())[:5]:
        print("   НЕ ПРОВЕРЕНО СЕТЬЮ %s -> %s" % (iu[:90], str(err)[:50]))
    for u, bad in defective[:12]:
        print("   ДЕФЕКТ %s -> %s" % (u, "; ".join(bad)))
    for u, err in errors[:5]:
        print("   СЕТЬ %s -> %s" % (u, err[:80]))

    print("ИТОГ: контроль %s (%d/%d); дефектов %d из %d страниц; %.0f с"
          % ("OK" if good else "ПРОВАЛ", ncases if good else 0, ncases,
             len(defective), len(res) - len(errors), time.time() - t0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
