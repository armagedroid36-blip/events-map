// Вкладка «Архив» (админ): все завершившиеся мероприятия.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import type { EventItem } from '../../lib/types';

export default function ArchiveTab() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const evs = await getApi().listArchived();
      if (!alive) return;
      setEvents(evs);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!events.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        {t('admin.archive.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((ev) => (
        <div key={ev.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="truncate font-medium text-gray-900">{ev.title_ru || ev.title_en || ev.title}</p>
          <p className="text-xs text-gray-500">
            {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
          </p>
        </div>
      ))}
    </div>
  );
}
