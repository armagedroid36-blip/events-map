#!/usr/bin/env python3
"""dot-1127: проверка «витрина не тянет фото из Supabase Storage» (корень egress).

Зачем: 402 exceed_egress_quota держится третьи сутки+. Основной канал трафика —
фото из Supabase Storage, которые отдают посетители. Если прод-бандл проксирует
их через кэш-CDN (wsrv.nl), egress базы от витрины не растёт, и блокер — остаток
квоты/спенд-кап на стороне владельца, а не дефект сайта.

Что проверяет (0 запросов к базе):
  A) в JS-бандле есть прокси-обёртка Storage → wsrv.nl (w=800, webp);
  B) статические SEO-страницы (/bali/, /cyprus/, страница события) НЕ содержат
     прямых ссылок supabase.co/storage.

Запуск: python scripts/dot-1127-egress-path-probe.py [--base https://mypins.site]
Выход 0 — путь закрыт; 1 — найден прямой канал (дефект); 2 — не удалось прочитать.
"""
import re
import sys
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (hermes-dot-events)"}
BASE = "https://mypins.site"
if "--base" in sys.argv:
    BASE = sys.argv[sys.argv.index("--base") + 1]

PAGES = [
    "/bali/",
    "/cyprus/",
    "/event/018d7128-5bef-416d-86ab-391b099805bf/rozhdestvenskaya-derevnya-v-marine-ayya-napa/",
]
STORAGE = "supabase.co/storage"


def get(url, limit=3_000_000):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(limit).decode("utf-8", "replace")


def main():
    fails = []
    try:
        html = get(BASE + "/")
    except Exception as e:  # noqa: BLE001
        print("НЕ ПРОЧИТАН главная:", e)
        return 2

    assets = re.findall(r'/assets/[A-Za-z0-9_.\-]+\.js', html)
    api = [a for a in assets if "api" in a] or assets[:4]
    wsrv_in_bundle = 0
    storage_regex = False
    for a in api:
        try:
            js = get(BASE + a)
        except Exception:  # noqa: BLE001
            continue
        wsrv_in_bundle += js.count("wsrv.nl")
        if re.search(r"supabase\\\.co\\/storage", js) or "storage/v1/object/public/" in js:
            storage_regex = True
    print("A) бандл: чанков %d, wsrv.nl %d, правило Storage→wsrv %s"
          % (len(api), wsrv_in_bundle, "есть" if storage_regex else "НЕТ"))
    if not wsrv_in_bundle:
        fails.append("в бандле нет wsrv.nl — фото отдаются напрямую")

    print("B) статические страницы:")
    for p in PAGES:
        try:
            body = get(BASE + p)
        except Exception as e:  # noqa: BLE001
            print("   %-70s НЕ ПРОЧИТАНА (%s)" % (p, e))
            fails.append("страница не прочитана: " + p)
            continue
        n = body.count(STORAGE)
        print("   %-70s прямых ссылок Storage: %d" % (p, n))
        if n:
            fails.append("прямой Storage URL на " + p)

    print()
    if fails:
        for f in fails:
            print("ДЕФЕКТ:", f)
        return 1
    print("ИТОГ: путь egress от витрины закрыт (wsrv-прокси в бандле, 0 прямых Storage-ссылок)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
