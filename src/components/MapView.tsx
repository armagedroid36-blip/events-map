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

// Кластеризация работает до зума 13 (clusterMaxZoom). На зуме >= 14
// (MARKER_MIN_ZOOM) кластеров нет, пины одиночек видны всегда; на зуме
// < 14 пин виден, только если событие не поглощено кластером.
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
        // Агрегат «есть ли в кластере избранное»: favCount = сумма fav (0/1)
        // по событиям кластера. Считается самим кластеризатором при setData,
        // поэтому переключение избранного обновляет бейджи без ручных вызовов.
        clusterProperties: { favCount: ['+', ['get', 'fav']] },
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
          // Без allow-overlap цифра скрывается, когда collision-бокс текста
          // задевает бейдж-сердечко (cluster-fav-heart лежит слоем выше и
          // размещается с приоритетом). Визуально сердечко на кромке круга и
          // цифру в центре не перекрывает — allow-overlap безопасен.
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      });
      // Бейдж «в кластере есть избранное»: маленькое сердечко у правого
      // верхнего края круга. Сердечко рисуется слоем-символом (иконка
      // 'heart-fav'), favCount приходит из clusterProperties источника.
      // icon-offset ступенчатый по point_count — бейдж «сидит» на кромке
      // круга при всех радиусах (18/28/40) и не перекрывает цифру в центре.
      const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ef4444" stroke="#ffffff" stroke-width="2"/></svg>`;
      const heartIcon = new Image();
      heartIcon.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heartSvg)}`;
      heartIcon.onload = () => {
        if (map.getImage('heart-fav') || !map.getSource('events')) return;
        map.addImage('heart-fav', heartIcon);
        map.addLayer({
          id: 'cluster-fav-heart',
          type: 'symbol',
          source: 'events',
          filter: ['all', ['has', 'point_count'], ['>', ['get', 'favCount'], 0]],
          layout: {
            'icon-image': 'heart-fav',
            'icon-size': 0.6,
            'icon-allow-overlap': true,
            'icon-offset': [
              'step',
              ['get', 'point_count'],
              ['literal', [12, -12]],
              10,
              ['literal', [22, -22]],
              100,
              ['literal', [34, -34]],
            ],
          },
        });
      };
      // Одиночные события НЕ рисуются слоем-кружком: на любом зуме они
      // показываются HTML-маркерами-пинами (видимость пересчитывается по
      // кластеризации источника — см. updateVisibility в data-эффекте).
      // Слой 'clusters' рисует только реальные кластеры (2+ событий).
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

    // Клик по кластеру — приближение к его центру. Тот же обработчик висит
    // на бейдже-сердечке ('cluster-fav-heart'): сердечко лежит на кромке
    // круга, его выступающая часть кликабельна так же, как сам кластер.
    const zoomToCluster = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
      map.easeTo({ center: [coords[0], coords[1]], zoom: map.getZoom() + 2 });
    };
    map.on('click', 'clusters', zoomToCluster);
    map.on('click', 'cluster-fav-heart', zoomToCluster);

    // Курсор-указатель над кластерами
    map.on('mouseenter', 'clusters', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'clusters', () => {
      map.getCanvas().style.cursor = '';
    });

    // Клик по пустой карте — сворачиваем открытые меню.
    // Клик по кластеру или HTML-маркеру сюда НЕ попадает: маркеры сами
    // останавливают всплытие (stopPropagation), а кластер/сердечко
    // фильтруются ниже.
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      // Клик по кластеру или бейджу-сердечку — меню не трогаем
      const feats = map.queryRenderedFeatures(e.point, {
        layers: ['clusters', 'cluster-fav-heart'],
      });
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
      properties: { id: string; color: string; fav: number } | null;
    }> = events
      .filter((ev) => isValidCoords(ev.lat, ev.lng) && ev.lat != null && ev.lng != null)
      .map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.lng!, ev.lat!] },
        properties: {
          id: ev.id,
          color: colorFor(ev.category_id),
          // 0/1 — всегда число: кластеризатор суммирует его в favCount
          // (clusterProperties источника). Гость (favoriteIds = null) даёт 0,
          // и бейджей на кластерах нет — фильтр favCount > 0 не сработает.
          fav: favoriteIds?.includes(ev.id) ? 1 : 0,
        },
      }));

    // События с координатами — для создания маркеров и spiderfy-раскладки
    const withCoords = events.filter(
      (ev) => isValidCoords(ev.lat, ev.lng) && ev.lat != null && ev.lng != null,
    );
    const evById = new Map(withCoords.map((ev) => [ev.id, ev]));
    // Zoom, на котором источник ПОСЛЕДНИЙ раз подтвердил кластеризацию
    // (sourcedata). querySourceFeatures между сменой зума и пересчётом
    // источника отдаёт УСТАРЕВШИЕ кластеры — показывать по ним нельзя.
    let lastClusterZoom: number | null = null;

    // Spiderfy-раскладка на ТЕКУЩЕМ зуме. В БД много событий с координатами
    // ЦЕНТРА ГОРОДА (одинаковые lat/lng) — такие пины лежат друг на друге.
    // Группы одинаковых координат разносим по кругу радиусом в пикселях
    // текущего зума (поэтому раскладку надо пересчитывать на каждом zoomend).
    const computePlaced = (): Map<string, [number, number]> => {
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
      return placed;
    };

    // Видимость HTML-маркеров-пинов. Правило: одиночное событие (не
    // входящее в кластер на ТЕКУЩЕМ зуме) показывается пином на любом зуме;
    // событие, поглощённое кластером, скрыто — его место занимает круг
    // кластера (без дублей). На зуме >= 14 (clusterMaxZoom 13) кластеризация
    // отключена — видны ВСЕ пины.
    const showAll = () => {
      markersRef.current.forEach((m) => {
        m.getElement().style.display = '';
      });
    };
    const hideAll = () => {
      markersRef.current.forEach((m) => {
        m.getElement().style.display = 'none';
      });
    };
    const updateVisibility = () => {
      if (map.getZoom() >= MARKER_MIN_ZOOM) {
        showAll();
        return;
      }
      // Зум < 14: geojson-источник сам кластеризует точки на текущем зуме —
      // одиночки приходят фичами БЕЗ point_count, участники кластеров
      // отдельными фичами не приходят вовсе. querySourceFeatures отдаёт
      // состояние кластеризации (в видимой области).
      const src = map.getSource('events');
      if (!src || !map.isSourceLoaded('events')) {
        // Источник ещё не подтвердил кластеризацию (setData/зум пересчитывает
        // асинхронно) — пины прячем, чтобы не мелькали до sourcedata
        hideAll();
        return;
      }
      // Кластеризация в источнике могла не догнать текущий зум (пересчёт
      // асинхронный) — querySourceFeatures отдаст устаревшее. Прячем пины
      // до sourcedata, который подтвердит состояние на актуальном зуме.
      if (lastClusterZoom === null || Math.abs(map.getZoom() - lastClusterZoom) > 0.05) {
        hideAll();
        return;
      }
      const feats = map.querySourceFeatures('events');
      const free = new Set<string>();
      for (const f of feats) {
        const p = f.properties;
        if (p && !p.point_count && typeof p.id === 'string') free.add(p.id);
      }
      markersRef.current.forEach((m) => {
        const id = m.getElement().dataset.eventId;
        m.getElement().style.display = id && free.has(id) ? '' : 'none';
      });
    };

    const apply = () => {
      // Источник для кластеров (создаётся на 'load' в init-эффекте)
      const src = map.getSource('events');
      if (src) {
        (src as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features,
        });
      }

      // HTML-маркеры-пины. Создаём СРАЗУ скрытыми — видимость включает только
      // updateVisibility(), когда источник подтвердил состояние кластеризации
      // (sourcedata); иначе между пересозданием и пересчётом мелькают ВСЕ пины.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const placed = computePlaced();
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
        // id события — для пересчёта видимости и позиций
        el.dataset.eventId = ev.id;
        el.style.display = 'none';
        const [mlng, mlat] = placed.get(ev.id) ?? [ev.lng!, ev.lat!];
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([mlng, mlat])
          .addTo(map);
        markersRef.current.push(marker);
      });

      // z >= 14: показать всех сразу (кластеризации нет — источник не нужен);
      // z < 14: пока скрыты, финальную видимость выставит sourcedata
      updateVisibility();
    };

    if (map.isStyleLoaded() && map.getSource('events')) apply();
    else map.once('load', apply);

    // Обновление spiderfy-позиций на новый зум БЕЗ пересоздания DOM
    // (пересоздание на каждом zoomend вызывало вспышку: свежие маркеры
    // видимы, пока источник не пересчитал кластеры). Позиции маркеров
    // меняются через setLngLat — элементы остаются теми же.
    const relayout = () => {
      const placed = computePlaced();
      markersRef.current.forEach((m) => {
        const id = m.getElement().dataset.eventId;
        const ev = id ? evById.get(id) : undefined;
        if (!ev) return;
        const p = placed.get(ev.id) ?? [ev.lng!, ev.lat!];
        m.setLngLat(p);
      });
    };

    const onZoomEnd = () => {
      if (!map.getSource('events')) return;
      relayout();
      // z >= 14: пины видны сразу (кластеров нет на любом состоянии источника)
      if (map.getZoom() >= MARKER_MIN_ZOOM) updateVisibility();
      // z < 14: видимость обновит sourcedata — после пересчёта кластеров
      // источником под новый зум (до него состояние пинов валидно)
    };
    map.on('zoomend', onZoomEnd);

    // Пересчёт видимости пинов: после пересчёта кластеров источником
    // (sourcedata) и по окончании панорамирования (события, въехавшие во
    // вьюпорт, могли выйти из кластера или попасть в него).
    const onSourceData = (e: maplibregl.MapSourceDataEvent) => {
      if (e.sourceId === 'events' && e.isSourceLoaded) {
        lastClusterZoom = map.getZoom();
        updateVisibility();
      }
    };
    const onMoveEnd = () => {
      if (!map.getSource('events')) return;
      updateVisibility();
    };
    map.on('sourcedata', onSourceData);
    map.on('moveend', onMoveEnd);

    return () => {
      map.off('zoomend', onZoomEnd);
      map.off('sourcedata', onSourceData);
      map.off('moveend', onMoveEnd);
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
