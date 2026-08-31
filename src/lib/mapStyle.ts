// Брендовый стиль карты (MapLibre GL): патч OpenFreeMap liberty —
// вода #72D2CF, главные дороги #E66343, фон #faf7f2.
// Источник — map-style-brand.json в корне проекта (111 слоёв), НЕ пересобирать.
import type { StyleSpecification } from 'maplibre-gl';
import brandStyle from '../../map-style-brand.json';

export const mapStyle = brandStyle as StyleSpecification;
