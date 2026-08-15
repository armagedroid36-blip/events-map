// Быстрые кнопки популярных направлений (Бали, Бангкок, Сингапур…).
import { config } from '../config';
import { useTranslation } from 'react-i18next';

interface Props {
  onGoTo: (lat: number, lng: number, zoom: number) => void;
}

export default function QuickLocations({ onGoTo }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-500">{t('map.quickLocations')}</span>
      {config.quickLocations.map((loc) => (
        <button
          key={loc.label}
          onClick={() => onGoTo(loc.lat, loc.lng, loc.zoom)}
          className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {loc.label}
        </button>
      ))}
    </div>
  );
}
