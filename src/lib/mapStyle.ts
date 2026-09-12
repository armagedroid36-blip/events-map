// Брендовый стиль карты (MapLibre GL): патч OpenFreeMap liberty —
// вода #72D2CF, главные дороги #E66343, фон #faf7f2.
// Источник — map-style-brand.json в корне проекта (111 слоёв), НЕ пересобирать.
//
// План Б (см. docs/tiles-fallback.md):
//  1) адреса тайлов можно переопределить переменными окружения при сборке —
//     VITE_TILES_URL (векторный источник), VITE_TILES_RASTER_URL (рельеф),
//     VITE_GLYPHS_URL (шрифты), VITE_SPRITE_URL (иконки);
//  2) если векторные тайлы не загрузились (сбой провайдера, блокировка) —
//     attachTilesFallback переключает карту на аварийный растровый стиль OSM,
//     чтобы сайт остался рабочим: маркеры, кластеры и фильтры продолжают жить.
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import brandStyle from '../../map-style-brand.json';

const env = import.meta.env as Record<string, string | undefined>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function withOverrides(style: StyleSpecification): StyleSpecification {
  const vector = env.VITE_TILES_URL;
  const raster = env.VITE_TILES_RASTER_URL;
  const glyphs = env.VITE_GLYPHS_URL;
  const sprite = env.VITE_SPRITE_URL;
  if (!vector && !raster && !glyphs && !sprite) return style;

  const next = clone(style);
  const sources = (next.sources ?? {}) as Record<string, any>;
  const openmaptiles = sources.openmaptiles;
  if (vector && openmaptiles) openmaptiles.url = vector;
  const ne2 = sources.ne2_shaded;
  if (raster && ne2?.tiles?.length) ne2.tiles = [raster];
  if (glyphs) next.glyphs = glyphs;
  if (sprite) next.sprite = sprite;
  return next;
}

export const mapStyle = withOverrides(brandStyle as StyleSpecification);

/** Аварийный стиль: растровые тайлы OpenStreetMap, без ключей и лимитов на ключ. */
export const fallbackRasterStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export const isFallbackStyle = (style?: StyleSpecification) =>
  !!style?.sources && 'osm' in style.sources && (style.layers?.length ?? 0) === 1;

/**
 * Следит за загрузкой векторных тайлов и при сбое переключает карту на растровый резерв.
 * Вызывать сразу после создания карты. Возвращает функцию принудительного переключения.
 */
export function attachTilesFallback(map: MapLibreMap, timeoutMs = 15000): () => void {
  // сразу после new Map() стиль может быть ещё не задан — читаем аккуратно
  try {
    if (isFallbackStyle(map.getStyle())) return () => {};
  } catch {
    /* стиль ещё не готов — продолжаем и следим за загрузкой */
  }

  let switched = false;
  const switchToRaster = (reason: string) => {
    if (switched) return;
    switched = true;
    console.warn('[map] аварийное переключение на растровые тайлы OSM:', reason);
    try {
      map.setStyle(fallbackRasterStyle);
    } catch (e) {
      console.warn('[map] не удалось переключить стиль:', e);
    }
  };

  const onError = (e: unknown) => {
    const err = (e as { error?: Error })?.error;
    const msg = String(err?.message ?? '');
    if (/openfreemap|tiles\.|sprite|glyph|source|Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      switchToRaster(msg.slice(0, 140));
    }
  };
  map.on('error', onError);

  const timer = window.setTimeout(() => {
    try {
      if (!map.isSourceLoaded('openmaptiles')) switchToRaster('источник openmaptiles не загрузился за 15 с');
    } catch {
      /* карта уже удалена */
    }
  }, timeoutMs);

  map.once('load', () => window.clearTimeout(timer));
  map.once('remove', () => window.clearTimeout(timer));

  return () => switchToRaster('включено вручную');
}
