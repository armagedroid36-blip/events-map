// Точка входа для `node --import`: подменяет globalThis.fetch на curl через
// локальный туннель ДО загрузки основного скрипта. Нужна там, где скрипт ходит
// в Supabase напрямую (Node fetch не уважает HTTP_PROXY, а прямой доступ к
// *.supabase.co из RU-сети режется).
// Пример: node --import ./scripts/dot-proxy-import.mjs scripts/backfill-translations.mjs
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();
