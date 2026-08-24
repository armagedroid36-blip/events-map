// Карта Leaflet + OpenStreetMap (бесплатно, без ключей).
// Маркеры-эмодзи по категориям, кластеризация при отдалении,
// управление центром извне (геолокация и быстрые кнопки).
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, AttributionControl } from 'react-leaflet';
import L from 'leaflet';
// Плагин кластеризации маркеров (регистрируется в Leaflet при импорте)
import 'leaflet.markercluster';
// Стили кластеров (подключаются явно)
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Category, EventItem } from '../lib/types';
import { isValidCoords } from '../lib/coords';
import { config } from '../config';

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

interface ClusterLayerProps {
  events: EventItem[];
  categories: Category[];
  onSelect: (ev: EventItem) => void;
}

/** Слой маркеров с кластеризацией */
function ClusterLayer({ events, categories, onSelect }: ClusterLayerProps) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  // Актуальный обработчик клика — чтобы не пересоздавать слой при каждом клике
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    // Группа кластеров создаётся один раз на время жизни карты
    if (!groupRef.current) {
      groupRef.current = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
      });
      map.addLayer(groupRef.current);
    }
    const group = groupRef.current;

    // Пересоздаём маркеры при изменении списка событий
    // (события с невалидными координатами — в море или 0,0 — не рисуем)
    group.clearLayers();
    const markers = events
      .filter((ev) => isValidCoords(ev.lat, ev.lng))
      .filter((ev): ev is EventItem & { lat: number; lng: number } => ev.lat != null && ev.lng != null)
      .map((ev) => {
      const cat = categories.find((c) => c.id === ev.category_id);
      const icon = L.divIcon({
        // Маркер: полупрозрачный SVG-пин-капля, цвет категории — обводка,
        // эмодзи — отдельным слоем ПОВЕРХ пина
        html: `<span class="event-marker" style="--marker-color:${colorFor(ev.category_id)}">
          <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 1 C9 1 2 8.5 2 18 C2 29 18 44 18 44 C18 44 34 29 34 18 C34 8.5 27 1 18 1 Z"
              fill="var(--marker-bg, rgba(255,255,255,0.85))" stroke="var(--marker-color)" stroke-width="2"/>
          </svg>
          <span class="event-marker-emoji">${cat?.emoji ?? '📍'}</span>
        </span>`,
        className: 'event-marker-wrap',
        iconSize: [36, 46],
        iconAnchor: [18, 44],
      });
      const marker = L.marker([ev.lat, ev.lng], { icon });
      marker.on('click', () => onSelectRef.current(ev));
      return marker;
    });
    if (markers.length) group.addLayers(markers);

    return () => {
      group.clearLayers();
    };
  }, [events, categories, map]);

  return null;
}

interface MapControllerProps {
  center?: { lat: number; lng: number } | null;
  zoom?: number;
}

/** Границы видимой области карты: [юго-запад, северо-восток] */
export type MapBounds = [[number, number], [number, number]];

/** Сообщает наружу видимую область карты при её перемещении/зуме */
function BoundsTracker({ onBoundsChange, onMapClick }: { onBoundsChange?: (b: MapBounds) => void; onMapClick?: () => void }) {
  const map = useMap();
  const cbRef = useRef(onBoundsChange);
  cbRef.current = onBoundsChange;
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    const fire = () => {
      if (!cbRef.current) return;
      const b = map.getBounds();
      cbRef.current([
        [b.getSouth(), b.getWest()],
        [b.getNorth(), b.getEast()],
      ]);
    };
    // Клик по карте — сворачиваем открытые меню
    const onClick = () => clickRef.current?.();
    map.on('moveend zoomend click', fire);
    map.on('click', onClick);
    return () => {
      map.off('moveend zoomend click', fire);
      map.off('click', onClick);
    };
  }, [map]);

  return null;
}

/** Внешнее управление центром карты (геолокация, быстрые кнопки) */
function MapController({ center, zoom }: MapControllerProps) {
  const map = useMap();
  const lastKey = useRef('');

  useEffect(() => {
    if (!center) return;
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${zoom ?? ''}`;
    if (key === lastKey.current) return; // не дёргать карту без надобности
    lastKey.current = key;
    map.flyTo([center.lat, center.lng], zoom ?? map.getZoom());
  }, [center, zoom, map]);

  return null;
}

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
}

export default function MapView({
  events,
  categories,
  onSelect,
  center,
  zoom,
  onBoundsChange,
  onMapClick,
}: MapViewProps) {
  const initialCenter: [number, number] = [
    center?.lat ?? config.defaultCenter.lat,
    center?.lng ?? config.defaultCenter.lng,
  ];

  return (
    <MapContainer
      center={initialCenter}
      zoom={zoom ?? config.defaultZoom}
      className="h-full w-full"
      style={{ minHeight: 320 }}
      // Кнопки зума скрыты: их перекрывают плавающие панели.
      // Зум работает колесом мыши, двойным кликом и жестами на телефоне.
      zoomControl={false}
      // Дефолтный контрол атрибуции (со ссылкой «Leaflet») выключен —
      // ниже рендерится свой с prefix={false}, чтобы ссылки не было.
      attributionControl={false}
    >
      {/* Тайлы Carto Voyager — бесплатно, без ключей. Названия на латинице
          (английский/транслит) вместо местных алфавитов */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {/* Атрибуция по центру внизу (центрируется CSS) — чтобы её не закрывали панели */}
      <AttributionControl position="bottomright" prefix={false} />
      <ClusterLayer events={events} categories={categories} onSelect={onSelect} />
      <MapController center={center} zoom={zoom} />
      <BoundsTracker onBoundsChange={onBoundsChange} onMapClick={onMapClick} />
    </MapContainer>
  );
}
