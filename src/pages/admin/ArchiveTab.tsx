// Вкладка «Архив» (админ): все завершившиеся мероприятия.
// Клик по строке — просмотр полной карточки (EventCard) в модалке;
// админ может удалить архивное событие из карточки.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/dates';
import EventCard from '../../components/EventCard';
import type { Category, EventItem } from '../../lib/types';

export default function ArchiveTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<EventItem | null>(null);

  async function load() {
    const [evs, cats] = await Promise.all([
      getApi().listArchived(),
      getApi().getCategories(),
    ]);
    setEvents(evs);
    setCategories(cats);
  }

  useEffect(() => {
    load().catch((err) => console.error('Не удалось загрузить архив:', err));
  }, []);

  // Удаление из карточки: EventCard уже показал подтверждение — здесь только
  // удаление, закрытие модалки и перезагрузка списка.
  async function handleDelete(id: string) {
    try {
      await getApi().deleteEvent(id);
      setSelected(null);
      await load();
    } catch (err) {
      console.error('Не удалось удалить событие:', err);
      alert('Не удалось удалить событие');
    }
  }

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
        <div
          key={ev.id}
          className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <button onClick={() => setSelected(ev)} className="min-w-0 flex-1 text-left">
            <span className="block break-words font-medium text-gray-900 hover:underline sm:truncate">
              {ev.title_ru || ev.title_en || ev.title}
            </span>
            <span className="block text-xs text-gray-500">
              {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
            </span>
          </button>
        </div>
      ))}

      {/* Просмотр полной карточки архивного события */}
      {selected && (
        <div
          className="fixed inset-0 z-[2000] overflow-y-auto bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="glass-strong relative mx-auto my-6 w-full max-w-lg rounded-xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              ✕
            </button>
            <EventCard
              event={selected}
              categories={categories}
              onClose={() => setSelected(null)}
              isAdmin={user?.role === 'admin'}
              isOwner={user?.id === selected.owner_id}
              onDelete={handleDelete}
              favoriteIds={null}
            />
          </div>
        </div>
      )}
    </div>
  );
}
