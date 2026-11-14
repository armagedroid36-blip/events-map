#!/usr/bin/env bash
# Разблокировка после аварии квоты Supabase (402 exceed_egress_quota).
# Запуск: bash ~/AppData/Local/hermes/dots/events/unblock.sh
# Делает только одно: если база отвечает 200 — поднимает сбор и пересборку прод-снапшота.
set -u
cd "$HOME/projects/events-map" || exit 1
set -a; . ./.env 2>/dev/null; set +a

code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $SUPABASE_SERVICE_ROLE" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
  "${VITE_SUPABASE_URL}/rest/v1/events?select=id&limit=1")
echo "REST=$code"
[ "$code" = "200" ] || { echo "БЛОК ДЕРЖИТСЯ — ничего не запускаю"; exit 0; }

# --- сначала снимаем уже подтверждённые дефекты данных: иначе следующий сбор вернёт их снова ---
DOTS="$HOME/AppData/Local/hermes/dots/events"
# node.exe/python.exe не понимают MSYS-пути (/c/...) — для них нужен native вид (C:/...)
DOTS_NATIVE=$(cygpath -m "$DOTS" 2>/dev/null || echo "C:/Users/armag/AppData/Local/hermes/dots/events")
REPO_NATIVE=$(cygpath -m "$HOME/projects/events-map" 2>/dev/null || echo "C:/Users/armag/projects/events-map")
if [ -f "$DOTS/dupes-822-apply.mjs" ]; then
  echo "--- снятие подтверждённых дублей (dupes-822-apply.mjs)"
  APPLY=1 node "$DOTS_NATIVE/dupes-822-apply.mjs" || echo "дубли: скрипт вернул ошибку, смотри вывод выше"
fi
if [ -f "$DOTS/pins-826-apply.mjs" ]; then
  echo "--- ремонт пинов (pins-826-apply.mjs)"
  APPLY=1 node "$DOTS_NATIVE/pins-826-apply.mjs" || echo "пины: скрипт вернул ошибку, смотри вывод выше"
fi
# 835: однодневные карточки с end_time РАНЬШЕ start_time (время второго сеанса в конце дня) -> end_time = null
if [ -f "$HOME/projects/events-map/dots/events/endtime-835-apply.mjs" ]; then
  echo "--- интервалы end_time < start_time (endtime-835-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/endtime-835-apply.mjs" || echo "интервалы: скрипт вернул ошибку, смотри вывод выше"
fi
# 840: окно серии с чужим end_time (Official Nicosia Christmas Market 28-29.11: 18:00 -> 20:00 по ленте CN)
if [ -f "$HOME/projects/events-map/dots/events/endtime-840-apply.mjs" ]; then
  echo "--- конец окна серии (endtime-840-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/endtime-840-apply.mjs" || echo "окно серии: скрипт вернул ошибку, смотри вывод выше"
fi
# 842: мюзикл «Οικογένεια Άνταμς» — у карточки Паттихо end_date = конец ГАСТРОЛИ (07.02), у карточки Никосии start_date = день Лимасола
if [ -f "$HOME/projects/events-map/dots/events/serie-addams-842-apply.mjs" ]; then
  echo "--- окно гастроли Аддамсов (serie-addams-842-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/serie-addams-842-apply.mjs" || echo "аддамсы: скрипт вернул ошибку, смотри вывод выше"
fi
# 843: карточки-АГРЕГАТЫ всего прогона при живых карточках окон (39 Steps, Большая книга, Фрост/Никсон)
if [ -f "$HOME/projects/events-map/dots/events/aggregate-run-843-apply.mjs" ]; then
  echo "--- агрегаты прогонов (aggregate-run-843-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/aggregate-run-843-apply.mjs" || echo "агрегаты: скрипт вернул ошибку, смотри вывод выше"
fi

if [ -f "$HOME/projects/events-map/dots/events/monday-850-apply.mjs" ]; then
  echo "--- A Monday to Die For: окно серии вместо интервала (monday-850-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/monday-850-apply.mjs" || echo "monday: скрипт вернул ошибку, смотри вывод выше"
fi

if [ -f "$HOME/projects/events-map/dots/events/memory-run-849-apply.mjs" ]; then
  echo "--- мастерские памяти: агрегат-интервал (memory-run-849-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/memory-run-849-apply.mjs" || echo "мастерские: скрипт вернул ошибку, смотри вывод выше"
fi

# 856: карточка в чужом городе (Tiramisu Bake-Off: Никосия -> Лимасол по арбитру CN + Nominatim)
if [ -f "$HOME/projects/events-map/dots/events/cardcity-856-apply.mjs" ]; then
  echo "--- карточка в чужом городе (cardcity-856-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/cardcity-856-apply.mjs" || echo "город: скрипт вернул ошибку, смотри вывод выше"
fi

# 857: агрегат гастрольного тура печатает окно тура как интервал (Спартак 27.11 Никосия, 28.11 Лимасол держит c2c6244e)
if [ -f "$HOME/projects/events-map/dots/events/tour-enddate-857-apply.mjs" ]; then
  echo "--- окно тура в интервале карточки (tour-enddate-857-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/tour-enddate-857-apply.mjs" || echo "тур: скрипт вернул ошибку, смотри вывод выше"
fi

# 858: третий показ тура «Спартак» стоит на городском фолбэке CN при известной площадке (Pattihio)
if [ -f "$HOME/projects/events-map/dots/events/spartacus30-pin-858-apply.mjs" ]; then
  echo "--- пин на городском фолбэке (spartacus30-pin-858-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/spartacus30-pin-858-apply.mjs" || echo "пин Спартака: скрипт вернул ошибку, смотри вывод выше"
fi

# 859: тур «Щелкунчик» — в end_time однодневной карточки попало время чужого показа / заглушка 23:59
if [ -f "$HOME/projects/events-map/dots/events/nutcracker-859-apply.mjs" ]; then
  echo "--- end_time тура Щелкунчик (nutcracker-859-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/nutcracker-859-apply.mjs" || echo "Щелкунчик: скрипт вернул ошибку, смотри вывод выше"
fi

# 13. Окно гастроли в карточке Mr and Mrs Bubble (866)
if [ -f "$HOME/projects/events-map/dots/events/bubble-866-apply.mjs" ]; then
  echo "--- окно гастроли Bubble (bubble-866-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/bubble-866-apply.mjs" || echo "Bubble: скрипт вернул ошибку, смотри вывод выше"
fi

if [ -f "$HOME/projects/events-map/dots/events/pinfix-873-apply.mjs" ]; then
  echo "--- пин площадки: Ktima Camelot / Ella Jazz Bar (pinfix-873-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/pinfix-873-apply.mjs" || echo "пинфикс-873: скрипт вернул ошибку, смотри вывод выше"
fi

if [ -f "$HOME/projects/events-map/dots/events/satiriko-pin-874-apply.mjs" ]; then
  echo "--- пин Сатирико (satiriko-pin-874-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/satiriko-pin-874-apply.mjs" || echo "Сатирико: скрипт вернул ошибку, смотри вывод выше"
fi

if [ -f "$HOME/projects/events-map/dots/events/ammo-876-apply.mjs" ]; then
  echo "--- пин Ammochostos Cultural Centre, Дериния (ammo-876-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/ammo-876-apply.mjs" || echo "Аммохостос: скрипт вернул ошибку, смотри вывод выше"
fi

if [ -f "$HOME/projects/events-map/dots/events/cy-addr-884-apply.mjs" ]; then
  echo "--- адрес-заглушка «Cyprus, Cyprus» (cy-addr-884-apply.mjs)"
  APPLY=1 node "$REPO_NATIVE/dots/events/cy-addr-884-apply.mjs" || echo "адрес-заглушка: скрипт вернул ошибку, смотри вывод выше"
fi

PAT=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep '^password=' | cut -d= -f2-)
api="https://api.github.com/repos/armagedroid36-blip/events-map"
for wf in collect-events.yml rebuild-pages.yml; do
  out=$(curl -s -o "$LOCALAPPDATA/Temp/dispatch_$wf" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
    "$api/actions/workflows/$wf/dispatches" -d '{"ref":"main"}')
  echo "dispatch $wf -> $out"
done
sleep 20
curl -s -H "Authorization: Bearer $PAT" "$api/actions/runs?per_page=4" | python -c "
import sys,json
for r in json.load(sys.stdin)['workflow_runs']:
    print(r['id'], r['name'], r['event'], r['status'], r['created_at'])
"

# --- миграция, без которой квота сгорит снова: RPC list_active_event_cards (+ description) ---
# DDL идёт только через Management API с PAT sbp_; токен берём из окружения, в файл не пишем.
ref=$(echo "${VITE_SUPABASE_URL}" | sed -E 's|https://([a-z0-9]+)\.supabase\.co.*|\1|')
sql_file="$REPO_NATIVE/supabase/migrations/20261109_list_active_event_cards_description.sql"
if [ -n "${SUPABASE_MGMT_TOKEN:-}" ]; then
  body=$(python -c "import json,sys;print(json.dumps({'query':open(sys.argv[1],encoding='utf-8').read()}))" "$sql_file")
  mc=$(curl -s -o "$LOCALAPPDATA/Temp/mgmt_query.json" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${SUPABASE_MGMT_TOKEN}" -H "Content-Type: application/json" \
    "https://api.supabase.com/v1/projects/$ref/database/query" --data-binary "$body")
  echo "миграция description -> $mc"
  [ "$mc" = "201" ] || { echo "миграция не применилась, смотри $LOCALAPPDATA/Temp/mgmt_query.json"; }
else
  echo "миграция description ПРОПУЩЕНА: нет SUPABASE_MGMT_TOKEN (нужен свежий sbp_)"
fi
