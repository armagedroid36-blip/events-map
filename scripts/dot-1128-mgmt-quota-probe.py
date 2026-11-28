#!/usr/bin/env python3
"""Зонд 1128: что о блокере 402 (exceed_egress_quota) говорит Management API Supabase.

Зачем: 34-е сутки REST отдаёт 402 «exceed_egress_quota». Витрина жива, гейт базы
корректно валит прогоны. Прежде чем снова спрашивать владельца, проверяем: нельзя ли
получить ЦИФРЫ квоты egress через API (а не только тело ошибки).

Токен берётся из окружения `SUPABASE_ACCESS_TOKEN` (PAT `sbp_...`), проект — из
`SUPABASE_PROJECT_REF`. Скрипт НЕ печатает токен и не пишет в базу (0 запросов к REST).

Что проверяется:
  A) GET /v1/projects/{ref}                  — статус проекта (ACTIVE_HEALTHY / paused / ...)
  B) GET /v1/projects/{ref}/health?services=db — живость БД
  C) GET /v1/projects/{ref}/billing/addons   — выбранные аддоны (спенд-кап читается только в дашборде)
  D) перебор кандидатов usage/billing-эндпоинтов — есть ли API, отдающий израсходованный egress

Итог печатается вердиктом:
  - «цифры квоты через Management API недоступны» — если все usage-эндпоинты 404/403;
  - иначе печатает найденный эндпоинт и его ответ (без секретов).

Повторный запуск:
  SUPABASE_ACCESS_TOKEN=$(...) SUPABASE_PROJECT_REF=xsbtejugutlpkgykiouw python scripts/dot-1128-mgmt-quota-probe.py
"""
import json
import os
import urllib.request
import urllib.error

TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
REF = os.environ.get("SUPABASE_PROJECT_REF", "xsbtejugutlpkgykiouw").strip()
BASE = "https://api.supabase.com/v1"
USAGE_CANDIDATES = [
    "projects/{ref}/usage",
    "projects/{ref}/usage/egress",
    "projects/{ref}/billing/usage",
    "projects/{ref}/billing/subscription",
    "organizations/{org}/usage",
    "organizations/{org}/billing/usage",
]


def get(path, timeout=25):
    req = urllib.request.Request(BASE + "/" + path,
                                 headers={"Authorization": "Bearer " + TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # сеть/таймаут
        return 0, repr(e)[:200]


def main():
    if not TOKEN:
        print("НЕТ ТОКЕНА: задай SUPABASE_ACCESS_TOKEN")
        return 2
    ok = True

    code, body = get("projects/%s" % REF)
    print("A) проект %s -> %s" % (REF, code))
    status = org = None
    if code == 200:
        try:
            j = json.loads(body)
            status = j.get("status")
            org = j.get("organization_slug") or j.get("organization_id")
            print("   name=%s status=%s region=%s" % (j.get("name"), status, j.get("region")))
        except Exception:
            print("   тело не JSON")
    else:
        ok = False
        print("   " + body[:200])

    code, body = get("projects/%s/health?services=db" % REF)
    print("B) health db -> %s %s" % (code, body[:160]))

    code, body = get("projects/%s/billing/addons" % REF)
    print("C) billing/addons -> %s" % code)
    if code == 200:
        try:
            j = json.loads(body)
            print("   selected_addons=%s" % (j.get("selected_addons"),))
        except Exception:
            pass

    print("D) usage/billing эндпоинты:")
    found = []
    for tpl in USAGE_CANDIDATES:
        path = tpl.format(ref=REF, org=org or "")
        if not path.endswith("/"):
            code, body = get(path)
            print("   %-46s %s" % (path, code))
            if code == 200:
                found.append((path, body[:300]))

    if org:
        code, body = get("organizations/%s" % org)
        print("E) организация %s -> %s" % (org, code))

    print()
    if found:
        print("ВЕРДИКТ: цифры квоты читаются API:")
        for p, b in found:
            print("  %s -> %s" % (p, b))
    else:
        print("ВЕРДИКТ: цифры квоты egress через Management API НЕДОСТУПНЫ "
              "(все usage-эндпоинты 404/403); статус проекта %s. "
              "Снять спенд-кап/повысить план может только владелец в дашборде." % status)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
