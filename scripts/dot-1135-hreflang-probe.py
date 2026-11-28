#!/usr/bin/env python3
"""dot-1135: сенсор hreflang/canonical детальных страниц событий (0 запросов к базе).

Класс: «языковые версии события рассинхронизированы» — RU и EN страницы одного
события (общий uuid в пути) не ссылаются друг на друга hreflang, или canonical
ведёт не туда. Проверяем:
  A) canonical страницы = сама страница (canonical на другую страницу — только если
     он есть в sitemap, т.е. алиас, и это печатается отдельно);
  B) hreflang своей языковой версии указывает на себя;
  C) если у события ЕСТЬ страница второго языка в sitemap (пара по uuid) — на неё
     обязан быть hreflang и обязателен x-default;
  D) взаимность: EN-страница пары ссылается обратно на RU (иначе связка порвана).
Пара по uuid, а не по слагу: слаги языковых версий переводятся (madam-marianna ↔
madame-marianne), сверка по слагу даёт ложные «нет пары».
Встроенный контроль парсера CASES: обязаны срабатывать/молчать синтетические HTML.
"""
import re, random, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SITE = "https://mypins.site"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
SAMPLE = 40
SEED = 1135
UUID = re.compile(r"/event/([0-9a-f-]{36})/")


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept-Language": "ru,en;q=0.8"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.geturl(), r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                return url, "ERR:%s" % e
            time.sleep(1.5)


LINK = re.compile(r"<link\b[^>]*>", re.I)
ATTR = re.compile(r'(\w[\w:-]*)\s*=\s*"([^"]*)"')


def parse_links(html):
    """-> (canonical, {hreflang: href})"""
    canon, alts = None, {}
    for tag in LINK.findall(html):
        a = dict(ATTR.findall(tag))
        rel = (a.get("rel") or "").lower()
        href = a.get("href") or ""
        if "canonical" in rel.split():
            canon = href
        if rel == "alternate" and a.get("hreflang"):
            alts[a["hreflang"].lower()] = href
    return canon, alts


def norm(u):
    u = (u or "").split("#")[0].split("?")[0]
    if u.startswith("/"):
        u = SITE + u
    return u.rstrip("/") + "/"


def lng(url):
    return "en" if "/en/event/" in url else "ru"


def checks(url, html, sitemap_set, pair_url):
    """pair_url = страница другого языка этого же uuid (или None, если её нет в карте)"""
    canon, alts = parse_links(html)
    bad, notes = [], []
    lang = lng(url)
    other = "en" if lang == "ru" else "ru"
    if canon is None:
        bad.append("нет canonical")
    elif norm(canon) != norm(url):
        if norm(canon) in sitemap_set:
            notes.append("canonical-alias")
        else:
            bad.append("canonical вне карты: " + norm(canon))
    if norm(alts.get(lang, "")) != norm(url):
        bad.append("нет hreflang на себя (%s)" % lang)
    if pair_url:
        if other not in alts:
            bad.append("нет hreflang " + other + " при живой EN-версии")
        elif norm(alts[other]) != norm(pair_url):
            bad.append("hreflang %s -> %s (ожидалось %s)" % (other, norm(alts[other]), norm(pair_url)))
        if "x-default" not in alts:
            bad.append("нет x-default")
    return bad, notes, canon


def selftest():
    b = SITE + "/event/abc-123/"
    e = SITE + "/en/event/abc-123/"
    sm = {norm(b), norm(e)}
    full = ('<link rel="canonical" href="%s"><link rel="alternate" hreflang="ru" href="%s">'
            '<link rel="alternate" hreflang="en" href="%s">'
            '<link rel="alternate" hreflang="x-default" href="%s">') % (b, b, e, b)
    cases = [
        ("полный набор + пара", b, full, sm, e, 0),
        ("нет canonical", b, full.replace('<link rel="canonical" href="%s">' % b, ""), sm, e, 1),
        ("нет hreflang вовсе", b, '<link rel="canonical" href="%s">' % b, sm, e, 3),
        ("hreflang en на чужой слаг", b, full.replace('href="%s"' % e, 'href="%s/event/zzz/"' % SITE), sm, e, 1),
        ("без x-default", b, full.replace('hreflang="x-default"', 'hreflang="x-mm"'), sm, e, 1),
        ("canonical на алиас в карте", b,
         ('<link rel="canonical" href="%s"><link rel="alternate" hreflang="ru" href="%s">'
          '<link rel="alternate" hreflang="en" href="%s">'
          '<link rel="alternate" hreflang="x-default" href="%s">') % (e, b, e, b), sm, e, 0),
        ("canonical вне карты", b,
         full.replace('rel="canonical" href="%s"' % b, 'rel="canonical" href="%s/event/nope/"' % SITE), sm, e, 1),
        ("hreflang ru не на себя", b,
         full.replace('hreflang="ru" href="%s"' % b, 'hreflang="ru" href="%s/event/xyz/"' % SITE), sm, e, 1),
        ("EN-страница, набор полный", e,
         ('<link rel="canonical" href="%s"><link rel="alternate" hreflang="en" href="%s">'
          '<link rel="alternate" hreflang="ru" href="%s">'
          '<link rel="alternate" hreflang="x-default" href="%s">') % (e, e, b, b), sm, b, 0),
        ("RU без EN-версии: hreflang en не требуется", b,
         ('<link rel="canonical" href="%s"><link rel="alternate" hreflang="ru" href="%s">') % (b, b),
         {norm(b)}, None, 0),
        ("RU без EN-версии, но hreflang en есть — не дефект", b,
         full, {norm(b)}, None, 0),
        ("относительный canonical", b,
         full.replace('rel="canonical" href="%s"' % b, 'rel="canonical" href="/event/abc-123/"'), sm, e, 0),
    ]
    ok = 0
    for name, url, html, smx, pair, want in cases:
        bad, notes, _ = checks(url, html, smx, pair)
        res = (len(bad) == want)
        ok += res
        print("  CASES %-42s ожид=%d факт=%d %s" % (name, want, len(bad), "OK" if res else "ПРОВАЛ " + ";".join(bad)))
    print("  КОНТРОЛЬ СЕНСОРА: %d/%d" % (ok, len(cases)))
    return ok == len(cases)


def main():
    t0 = time.time()
    print("A. КОНТРОЛЬ СЕНСОРА")
    good = selftest()

    _, sm = get(SITE + "/sitemap.xml?v=%d" % int(time.time()))
    if sm.startswith("ERR"):
        print("sitemap недоступен:", sm[:120]); return 1
    urls = re.findall(r"<loc>([^<]+)</loc>", sm)
    sitemap_set = {norm(u) for u in urls}
    ru, en = {}, {}
    for u in urls:
        m = UUID.search(u)
        if not m:
            continue
        (en if "/en/event/" in u else ru)[m.group(1)] = u
    print("B. ИНВЕНТАРЬ: sitemap %d URL, event RU %d, EN %d, общий uuid у %d"
          % (len(urls), len(ru), len(en), len(set(ru) & set(en))))

    random.seed(SEED)
    keys = sorted(ru)
    picks = random.sample(keys, min(SAMPLE, len(keys)))
    print("C. ВЫБОРКА %d RU-страниц (seed %d), у %d из них есть EN-версия"
          % (len(picks), SEED, sum(1 for k in picks if k in en)))

    def one(k):
        u = ru[k]
        pair = en.get(k)
        got, html = get(u)
        if html.startswith("ERR"):
            return k, None, html, pair
        bad, notes, _ = checks(u, html, sitemap_set, pair)
        return k, (bad, notes), "", pair

    with ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(one, picks))

    defects, errors, alias = [], [], 0
    for k, r, err, pair in res:
        if r is None:
            errors.append((ru[k], err)); continue
        bad, notes = r
        alias += bool(notes)
        if bad:
            defects.append((ru[k], bad, pair))
    print("D. RU: проверено %d, ошибок сети %d, canonical-алиасов %d, дефектов %d"
          % (len(res) - len(errors), len(errors), alias, len(defects)))
    for u, bad, _ in defects[:10]:
        print("   ДЕФЕКТ %s -> %s" % (u, "; ".join(bad)))

    # E. взаимность EN
    en_targets = [(k, pair) for k, r, err, pair in res if r and pair]
    def one_en(kt):
        k, pair = kt
        got, html = get(pair)
        if html.startswith("ERR"):
            return pair, None, html
        bad, notes, _ = checks(pair, html, sitemap_set, ru[k])
        return pair, bad, ""
    with ThreadPoolExecutor(max_workers=8) as ex:
        res2 = list(ex.map(one_en, en_targets))
    d2 = [(u, bad) for u, bad, e in res2 if bad]
    err2 = [u for u, bad, e in res2 if bad is None]
    print("E. ВЗАИМНОСТЬ EN: проверено %d, ошибок %d, дефектов %d" % (len(res2) - len(err2), len(err2), len(d2)))
    for u, bad in d2[:10]:
        print("   ДЕФЕКТ %s -> %s" % (u, "; ".join(bad)))

    total = len(res) - len(errors) + len(res2) - len(err2)
    print("ИТОГ: контроль %s; дефектов RU %d + EN %d = %d (страниц %d, %.0f с)"
          % ("OK" if good else "ПРОВАЛ", len(defects), len(d2), len(defects) + len(d2), total, time.time() - t0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
