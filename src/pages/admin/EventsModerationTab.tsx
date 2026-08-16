// Вкладка «Модерация событий»: события организаторов, ожидающие решения.
// Принять — событие появляется на карте; отклонить — статус rejected.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import type { Category, EventItem } from '../../lib/types';

interface Props {
  onChanged: () => void;
}

export default function EventsModerationTab({ onChanged }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [evs, cats] = await Promise.all([api.listAllEvents(), api.getCategories()]);
      if (!alive) return;
      setEvents(evs.filter((e) => e.status === 'moderation'));
      setCategories(cats);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function approve(id: string) {
    setBusyId(id);
    await getApi().approveEvent(id);
    setEvents((xs) => xs.filter((x) => x.id !== id));
    setBusyId(null);
    onChanged();
  }

  async function reject(id: string) {
    setBusyId(id);
    await getApi().rejectEvent(id);
    setEvents((xs) => xs.filter((x) => x.id !== id));
    setBusyId(null);
    onChanged();
  }

  if (!events.length) {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        {t('admin.eventsModeration.empty')}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">
        {t('admin.eventsModeration.title')}
      </h2>
      <div className="space-y-2">
        {events.map((ev) => {
          const cat = categories.find((c) => c.id === ev.category_id);
          return (
            <div key={ev.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{ev.title_ru || ev.title_en || ev.title}</p>
                <p className="text-xs text-gray-500">
                  {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
                  {cat ? ` • ${cat.emoji} ${cat.name_ru}` : ''}
                </p>
                {/* Контакты организатора — видны только админу */}
                {(ev.contact_telegram || ev.contact_whatsapp || ev.contact_email || ev.contact_phone) && (
                  <p className="mt-1 text-xs text-gray-600">
                    {[ev.contact_telegram && `TG: ${ev.contact_telegram}`, ev.contact_whatsapp && `WA: ${ev.contact_whatsapp}`, ev.contact_email && ev.contact_email, ev.contact_phone && ev.contact_phone]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => approve(ev.id)}
                  disabled={busyId === ev.id}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-50"
                >
                  {t('admin.moderation.approve')}
                </button>
                <button
                  onClick={() => reject(ev.id)}
                  disabled={busyId === ev.id}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {t('admin.moderation.reject')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
