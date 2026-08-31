// Карта MapLibre GL + OpenFreeMap (брендовый стиль, без ключей).
// Маркеры-эмодзи по категориям, кластеризация слоями MapLibre,
// управление центром извне (геолокация и быстрые кнопки).
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import type { Category, EventItem } from '../lib/types';
import { isValidCoords } from '../lib/coords';
import { config } from '../config';
import { mapStyle } from '../lib/mapStyle';

// Акцентные цвета — только для категорий (по спецификации дизайна)
const CATEGORY_COLORS = [
  '#e11d48', '#2563eb', '#7c3aed', '#059669',
  '#d97706', '#db2777', '#0891b2', '#65a30d',
];

/** Стабильный цвет категории по её id */
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return CATEGORY_COLORS[Math.abs(h) % CATEGORY_COLORS.length];
}

// Кластеризация работает до этого зума (clusterMaxZoom 13) —
// выше события показываются отдельными HTML-маркерами
const MARKER_MIN_ZOOM = 14;

/** Границы видимой области карты: [юго-запад, северо-восток] */
export type MapBounds = [[number, number], [number, number]];

interface MapViewProps {
  events: EventItem[];
  categories: Category[];
  onSelect: (ev: EventItem) => void;
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  /** Изменение видимой области карты (для списка «События на карте») */
  onBoundsChange?: (b: MapBounds) => void;
  /** Клик по карте (сворачивает открытые меню) */
  onMapClick?: () => void;
  /** id событий в избранном; null — гость (сердечки скрыты) */
  favoriteIds?: string[] | null;
}

export default function MapView({
  events,
  categories,
  onSelect,
  center,
  zoom,
  onBoundsChange,
  onMapClick,
  favoriteIds,
}: MapViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Актуальные колбэки — без пересоздания слушателей
  const cbRef = useRef({ onSelect, onBoundsChange, onMapClick });
  cbRef.current = { onSelect, onBoundsChange, onMapClick };
  // Ключ последнего внешнего центра — чтобы не дёргать карту без надобности
  const lastCenterKey = useRef('');

  // Инициализация карты — ОДИН раз на время жизни компонента
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const initial: [number, number] = [
      center?.lng ?? config.defaultCenter.lng,
      center?.lat ?? config.defaultCenter.lat,
    ];
    const map = new maplibregl.Map({
      container: el,
      style: mapStyle,
      center: initial,
      zoom: zoom ?? config.defaultZoom,
      minZoom: 3,
      attributionControl: false,
    });
    // Атрибуция OpenFreeMap + OSM (компактный контрол, внизу справа)
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: config.mapAttribution }),
      'bottom-right',
    );
    mapRef.current = map;

    // Источник событий + слои кластеров создаются при загрузке стиля
    map.on('load', () => {
      if (map.getSource('events')) return;
      map.addSource('events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'events',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#E66343',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 28, 100, 40],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'events',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
    });

    // Границы видимой области (для списка «События на карте»)
    const fireBounds = () => {
      if (!cbRef.current.onBoundsChange) return;
      const b = map.getBounds();
      cbRef.current.onBoundsChange([
        [b.getSouth(), b.getWest()],
        [b.getNorth(), b.getEast()],
      ]);
    };
    map.on('moveend', fireBounds);
    map.on('zoomend', fireBounds);

    // Клик по кластеру — приближение к его центру
    map.on('click', 'clusters', (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
      map.easeTo({ center: [coords[0], coords[1]], zoom: map.getZoom() + 2 });
    });

    // Видимость HTML-маркеров: только с зума 14 (до этого — кластеры)
    const toggleMarkers = () => {
      const show = map.getZoom() >= MARKER_MIN_ZOOM;
      markersRef.current.forEach((m) => {
        m.getElement().style.display = show ? '' : 'none';
      });
    };
    map.on('zoomend', toggleMarkers);

    // Клик по пустой карте — сворачиваем открытые меню.
    // Клик по кластеру или HTML-маркеру сюда НЕ попадает: маркеры сами
    // останавливают всплытие (stopPropagation), а кластер фильтруется ниже.
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      // Клик по кластеру — приближение, меню не трогаем
      const feats = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (feats.length > 0) return;
      cbRef.current.onMapClick?.();
    });

    return () => {
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Внешнее управление центром (геолокация, быстрые кнопки)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${zoom ?? ''}`;
    if (key === lastCenterKey.current) return;
    lastCenterKey.current = key;
    map.flyTo({ center: [center.lng, center.lat], zoom: zoom ?? map.getZoom() });
  }, [center, zoom]);

  // Данные: кластеризованный источник + HTML-маркеры одиночных событий
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const features: Array<{
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: { id: string } | null;
    }> = events
      .filter((ev) => isValidCoords(ev.lat, ev.lng) && ev.lat != null && ev.lng != null)
      .map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.lng!, ev.lat!] },
        properties: { id: ev.id },
      }));

    const apply = () => {
      // Источник для кластеров (создаётся на 'load' в init-эффекте)
      const src = map.getSource('events');
      if (src) {
        (src as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features,
        });
      }

      // HTML-маркеры одиночных событий (те же, что были на Leaflet).
      // Spiderfy: в БД много событий с координатами ЦЕНТРА ГОРОДА (одинаковые
      // lat/lng) — такие пины лежат друг на друге и «теряются» при раскрытии
      // кластера. Группы одинаковых координат разносим по кругу.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const withCoords = events.filter(
        (ev) => isValidCoords(ev.lat, ev.lng) && ev.lat != null && ev.lng != null,
      );
      // Событие -> смещённые координаты [lng, lat] (для групп дублей)
      const placed = new Map<string, [number, number]>();
      const groups = new Map<string, EventItem[]>();
      for (const ev of withCoords) {
        const key = `${ev.lat!.toFixed(4)},${ev.lng!.toFixed(4)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(ev);
      }
      for (const group of groups.values()) {
        const [lat0, lng0] = [group[0].lat!, group[0].lng!];
        if (group.length === 1) {
          placed.set(group[0].id, [lng0, lat0]);
          continue;
        }
        const base = map.project([lng0, lat0]);
        const radius = 18 + Math.min(34, (group.length - 1) * 5);
        group.forEach((ev, i) => {
          const ang = (i / group.length) * Math.PI * 2 - Math.PI / 2;
          const pt = map.unproject([base.x + Math.cos(ang) * radius, base.y + Math.sin(ang) * radius]);
          placed.set(ev.id, [pt.lng, pt.lat]);
        });
      }

      withCoords.forEach((ev) => {
        const cat = categories.find((c) => c.id === ev.category_id);
        const fav = favoriteIds?.includes(ev.id) ?? false;
        const el = document.createElement('span');
        el.className = 'event-marker';
        el.style.setProperty('--marker-color', colorFor(ev.category_id));
        el.style.cursor = 'pointer';
        el.innerHTML = `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 1 C9 1 2 8.5 2 18 C2 29 18 44 18 44 C18 44 34 29 34 18 C34 8.5 27 1 18 1 Z"
              fill="var(--marker-bg, rgba(255,255,255,0.85))" stroke="var(--marker-color)" stroke-width="2"/>
          </svg>
          <span class="event-marker-emoji">${cat?.emoji ?? '📍'}</span>
          ${
            fav
              ? '<svg class="event-marker-fav" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ef4444" stroke="#ffffff" stroke-width="2"/></svg>'
              : ''
          }`;
        el.addEventListener('click', (e: MouseEvent) => {
          // Без stopPropagation клик по пину всплывает до контейнера карты,
          // маплibre эмитит map click -> onMapClick закрывает только что
          // открытую карточку события
          e.stopPropagation();
          cbRef.current.onSelect(ev);
        });
        const [mlng, mlat] = placed.get(ev.id) ?? [ev.lng!, ev.lat!];
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([mlng, mlat])
          .addTo(map);
        markersRef.current.push(marker);
      });

      // Видимость по текущему зуму
      const show = map.getZoom() >= MARKER_MIN_ZOOM;
      markersRef.current.forEach((m) => {
        m.getElement().style.display = show ? '' : 'none';
      });
    };

    if (map.isStyleLoaded() && map.getSource('events')) apply();
    else map.once('load', apply);

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [events, categories, favoriteIds]);

  return (
    <div className="relative h-full w-full" style={{ minHeight: 320 }}>
      <div ref={containerRef} className="h-full w-full" />
      {/* Ссылки «Политика» и «Контакты» — по центру внизу, над атрибуцией */}
      <div className="absolute bottom-9 left-1/2 z-[1000] flex -translate-x-1/2 gap-2">
        <a
          href="#/privacy"
          className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-sm hover:text-gray-900"
        >
          {t('privacy.link')}
        </a>
        <a
          href="#/contacts"
          className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-sm hover:text-gray-900"
        >
          {t('contacts.link')}
        </a>
      </div>
    </div>
  );
}
