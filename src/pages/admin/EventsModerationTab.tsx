// Вкладка «Модерация событий»: события организаторов, ожидающие решения.
// Клик по событию — просмотр полной карточки; принять/отклонить.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import EventCard from '../../components/EventCard';
import EventForm from '../../components/EventForm';
import type { Category, EventItem } from '../../lib/types';

interface Props {
  onChanged: () => void;
}

export default function EventsModerationTab({ onChanged }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Выбранное для просмотра событие
  const [selected, setSelected] = useState<EventItem | null>(null);
  // Событие в режиме редактирования
  const [editEvent, setEditEvent] = useState<EventItem | null>(null);
  // Подтверждение «Удалить все»
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      {/* Удалить все (с подтверждением) */}
      {events.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm text-gray-500">
            {t('admin.moderation.title')}: {events.length}
          </span>
          {!confirmDelete ? (
            <button
              onClick={() => {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 6000);
              }}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              {t('admin.moderation.deleteAll')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await getApi().deleteModerationEvents();
                    onChanged();
                  } catch {
                    /* ошибка — список останется */
                  } finally {
                    setDeleting(false);
                    setConfirmDelete(false);
                  }
                }}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t('admin.moderation.deleteAllConfirm', { count: events.length })}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {events.map((ev) => {
          const cat = categories.find((c) => c.id === ev.category_id);
          return (
            <div key={ev.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <button
                onClick={() => setSelected(ev)}
                className="min-w-0 flex-1 text-left"
                title={t('admin.moderation.view')}
              >
                <p className="truncate font-medium text-gray-900 hover:underline">
                  {ev.title_ru || ev.title_en || ev.title}
                </p>
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
              </button>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  onClick={() => setEditEvent(ev)}
                  className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t('admin.moderation.edit')}
                </button>
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

      {/* Просмотр полной карточки события */}
      {selected && (
        <div
          className="fixed inset-0 z-[2000] overflow-y-auto bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div className="glass-strong mx-auto my-6 w-full max-w-lg rounded-xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <EventCard event={selected} categories={categories} onClose={() => setSelected(null)} />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  const id = selected.id;
                  setSelected(null);
                  approve(id);
                }}
                className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-500"
              >
                {t('admin.moderation.approve')}
              </button>
              <button
                onClick={() => {
                  const id = selected.id;
                  setSelected(null);
                  reject(id);
                }}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                {t('admin.moderation.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Форма редактирования события (админ) */}
      {editEvent && (
        <EventForm
          categories={categories}
          editEvent={editEvent}
          onClose={() => {
            setEditEvent(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
