#!/usr/bin/env python3
"""Очистка фото завершившихся событий (архива) из Supabase Storage.

Логика (единая с list_active_events и isUpcoming на фронте):
- Завершившееся событие: coalesce(end_date, start_date) < today
  И НЕ бессрочная регулярная серия (recurrence есть, end_date пуст).
- Актуальные события (фото НЕ трогаем): не завершившиеся
  И статус в (active, moderation, needs_changes).
- Для каждого завершившегося события удаляются объекты bucket 'photos',
  пути которых НЕ используются ни одним актуальным событием
  (защита повторного использования, в т.ч. repeatEvent-копий).
- После удаления поле photos события перезаписывается: остаются только
  пути, разделяемые с актуальными событиями (или не удалившиеся).

Внешние ссылки (http/https/data:) не являются объектами storage —
физически не удаляются, но из поля photos завершившихся событий уходят.

Запуск: ежедневно в GitHub Actions (cleanup-archive-photos.yml, 03:30 UTC)
+ вручную через workflow_dispatch. Локально: DRY_RUN=1 — только план.
Переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE (оба заголовка
apikey + Authorization, иначе PostgREST считает запрос анонимным).
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL', '')
SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE', '')
DRY_RUN = os.environ.get('DRY_RUN') == '1'
ACTUAL_STATUSES = ('active', 'moderation', 'needs_changes')


def err(msg: str) -> int:
    print(msg)
    return 1


def request(method: str, url: str, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'apikey': SERVICE_ROLE,
            'Authorization': f'Bearer {SERVICE_ROLE}',
            'Accept': 'application/json',
        },
        method=method,
    )
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
        return r.status, (json.loads(raw) if raw else None)


def is_storage_path(p: str) -> bool:
    low = p.lower()
    return not (low.startswith('http://') or low.startswith('https://') or low.startswith('data:'))


def main() -> int:
    if not SUPABASE_URL or not SERVICE_ROLE:
        return err('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE')

    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()

    # 1) Все события (включая прошедшие) — service role обходит RLS
    try:
        _, events = request('GET', f'{SUPABASE_URL}/rest/v1/events?select=id,status,start_date,end_date,recurrence,photos')
    except Exception as e:  # noqa: BLE001
        return err(f'Ошибка выборки событий: {e}')
    if not isinstance(events, list):
        return err(f'Неожиданный ответ при выборке событий: {str(events)[:200]}')

    def finished(ev) -> bool:
        end = ev.get('end_date') or ev.get('start_date')
        if not end:
            return False
        # Бессрочная регулярная серия (end_date пуст) — всегда актуальна
        if ev.get('recurrence') and not ev.get('end_date'):
            return False
        return end < today

    actual_paths = set()
    actual_count = 0
    for ev in events:
        if not finished(ev) and ev.get('status') in ACTUAL_STATUSES:
            actual_count += 1
            for p in ev.get('photos') or []:
                if p:
                    actual_paths.add(p)

    # 2) Завершившиеся события + кандидаты на удаление
    to_delete = set()          # уникальные storage-пути на удаление
    finished_evs = []          # (id, photos, kept, changed)
    for ev in events:
        if not finished(ev):
            continue
        photos = [p for p in (ev.get('photos') or []) if p]
        kept = []
        for p in photos:
            if p in actual_paths:
                kept.append(p)          # используется актуальным — не трогаем
            elif is_storage_path(p):
                to_delete.add(p)
            # внешняя ссылка (http/https/data:) — не объект storage, уходит из поля
        if photos:
            finished_evs.append({'id': ev['id'], 'photos': photos, 'kept': kept})

    print(f'Всего событий: {len(events)}')
    print(f'Актуальных (фото не трогаем): {actual_count}')
    print(f'Завершившихся с фото в поле: {len(finished_evs)}')
    print(f'Объектов storage к удалению (уникальных): {len(to_delete)}')

    if DRY_RUN:
        print('DRY_RUN: удаление и обновления пропущены.')
        for ev in finished_evs:
            removed = [p for p in ev['photos'] if p not in ev['kept']]
            print(f'  - {ev["id"]}: фото {len(ev["photos"])} -> {len(ev["kept"])} (удалить {len(removed)})')
        return 0

    # 3) Удаление объектов из bucket 'photos'
    deleted_ok = 0
    deleted_missing = 0
    failed_deletes = set()
    errors = []
    for path in sorted(to_delete):
        url = f'{SUPABASE_URL}/storage/v1/object/photos/' + '/'.join(
            urllib.parse.quote(seg, safe='') for seg in path.split('/')
        )
        try:
            status, _ = request('DELETE', url)
            if status in (200, 204):
                deleted_ok += 1
            else:
                failed_deletes.add(path)
                errors.append(f'DELETE {path}: HTTP {status}')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                deleted_missing += 1  # объекта уже нет — считаем удалённым
            else:
                failed_deletes.add(path)
                errors.append(f'DELETE {path}: HTTP {e.code}')
        except Exception as e:  # noqa: BLE001
            failed_deletes.add(path)
            errors.append(f'DELETE {path}: {e}')
    print(f'Удалено объектов: {deleted_ok}, отсутствовали: {deleted_missing}, ошибок: {len(errors)}')

    # 4) Обновление поля photos у завершившихся событий
    updated = 0
    for ev in finished_evs:
        # Остаются только пути, разделяемые с актуальными событиями,
        # и пути, чьё удаление не удалось (иначе ссылка стала бы битой).
        new_photos = [p for p in ev['photos'] if p in actual_paths or p in failed_deletes]
        if new_photos == ev['photos']:
            continue  # ничего не изменилось — PATCH не нужен
        try:
            status, _ = request(
                'PATCH',
                f"{SUPABASE_URL}/rest/v1/events?id=eq.{urllib.parse.quote(ev['id'], safe='')}",
                {'photos': new_photos},
            )
            if status in (200, 204):
                updated += 1
            else:
                errors.append(f'PATCH {ev["id"]}: HTTP {status}')
        except Exception as e:  # noqa: BLE001
            errors.append(f'PATCH {ev["id"]}: {e}')

    print(f'Событий с очищенным полем photos: {updated}')
    if errors:
        for e in errors[:20]:
            print('  !', e)
        return err(f'Завершено с {len(errors)} ошибками.')
    print('Готово: архивные фото удалены, актуальные не тронуты.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
