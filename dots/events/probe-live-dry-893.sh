#!/bin/bash
# Живой DRY ВСЕХ шагов unblock.sh: печатает счётчик целей каждого шага.
# Запуск: bash ~/projects/events-map/dots/events/probe-live-dry-893.sh
# Питфол: шаги печатают счётчики РАЗНЫМИ словами (правок / пар / карточек / целей),
# поэтому единого «итого» быть не может — важно, что у каждого шага счётчик НЕ ноль.
DOTS_NATIVE="C:/Users/armag/AppData/Local/hermes/dots/events"
REPO_NATIVE="C:/Users/armag/projects/events-map"
cd "$REPO_NATIVE" || exit 1
set -a; . ./.env 2>/dev/null; set +a
while IFS= read -r line; do
  path=$(echo "$line" | sed -n 's/.*APPLY=1 node "\(.*\)" .*/\1/p')
  [ -z "$path" ] && continue
  real=$(echo "$path" | sed "s#\$DOTS_NATIVE#$DOTS_NATIVE#; s#\$REPO_NATIVE#$REPO_NATIVE#")
  name=$(basename "$real")
  out=$(timeout 60 node "$real" 2>&1)
  cnt=$(echo "$out" | grep -oE "(правок|пар|карточек|целей)[: ]+[0-9]+" | head -1)
  mode=$(echo "$out" | grep -c "DRY-RUN")
  stop=$(echo "$out" | grep -c "402")
  printf "%-30s %-14s dry=%s 402=%s\n" "$name" "${cnt:-НЕТ_СЧЁТЧИКА}" "$mode" "$stop"
done < <(grep "APPLY=1 node" "$DOTS_NATIVE/unblock.sh")
