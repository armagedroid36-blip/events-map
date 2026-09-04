// «Мои мероприятия» — личный кабинет организатора.
// Вкладки: активные (и их статус) и архив (прошедшие).
// «Повторить» открывает форму со всеми данными события — организатор
// правит что хочет и отправляет на модерацию.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Category, EventItem } from '../lib/types';
import { formatDate } from '../lib/dates';
import EventForm from '../components/EventForm';
import EventCard from '../components/EventCard';

export default function MyEvents() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [archive, setArchive] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [repeat, setRepeat] = useState<EventItem | null>(null);
  // Редактирование существующей карточки (организатор)
  const [edit, setEdit] = useState<EventItem | null>(null);
  // Просмотр полной карточки архивного события (модалка)
  const [view, setView] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  // id события, которое сейчас удаляется (busy на кнопке-корзине)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [ev, ar, cats] = await Promise.all([
        getApi().listMyEvents(),
        getApi().listArchived(),
        getApi().getCategories(),
      ]);
      setEvents(ev);
      setArchive(ar);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }

  // Удаление из открытой карточки архивного события: EventCard уже показал
  // подтверждение — здесь только удаление, закрытие и перезагрузка списка.
  async function handleDeleteFromCard(id: string) {
    try {
      await getApi().deleteEvent(id);
      setView(null);
      await load();
    } catch (err) {
      console.error('Не удалось удалить событие:', err);
      alert('Не удалось удалить событие');
    }
  }

  useEffect(() => {
    if (user?.role === 'org') {
      load();
      // Отметить просмотр «Моих событий»: бейдж уведомлений в шапке исчезает.
      // Событие 'my-events-seen' слушает Header и пересчитывает бейдж.
      getApi()
        .markMyEventsSeen()
        .then(() => window.dispatchEvent(new CustomEvent('my-events-seen')))
        .catch(() => {});
    }
  }, [user]);

  if (!user || user.role !== 'org') {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">
          {t('myEvents.accessDenied')}
        </div>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    active: t('myEvents.statusActive'),
    moderation: t('myEvents.statusModeration'),
    rejected: t('myEvents.statusRejected'),
    needs_changes: t('myEvents.statusNeedsChanges'),
  };

  function StatusTag({ ev }: { ev: EventItem }) {
    if (ev.status === 'active') return <span className="text-green-600">{statusLabel.active}</span>;
    if (ev.status === 'moderation') return <span className="text-amber-600">{statusLabel.moderation}</span>;
    if (ev.status === 'needs_changes')
      return (
        <span className="text-orange-600">
          {statusLabel.needs_changes}
          {ev.reject_reason && (
            <span className="mt-0.5 block text-xs font-normal text-gray-500">
              {t('myEvents.reason', { reason: ev.reject_reason })}
            </span>
          )}
        </span>
      );
    return <span className="text-red-600">{statusLabel.rejected}</span>;
  }

  function EventRow({ ev }: { ev: EventItem }) {
    const isArchive = ev.status === 'archived';

    async function handleDelete() {
      if (!window.confirm(t('myEvents.deleteConfirm'))) return;
      setDeletingId(ev.id);
      try {
        await getApi().deleteEvent(ev.id);
        await load();
      } catch (err) {
        console.error('Не удалось удалить событие:', err);
        alert('Не удалось удалить событие');
      } finally {
        setDeletingId(null);
      }
    }

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        {isArchive ? (
          // Архивная строка: клик по заголовку — полная карточка события
          <button
            onClick={() => setView(ev)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate font-medium text-gray-900 hover:underline">
              {ev.title_ru || ev.title_en || ev.title}
            </span>
            <span className="block text-xs text-gray-500">
              {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
            </span>
          </button>
        ) : (
          <div className="min-w-0 w-full sm:w-auto">
            <p className="truncate font-medium text-gray-900">
              {ev.title_ru || ev.title_en || ev.title}
            </p>
            <p className="text-xs text-gray-500">
              {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
            </p>
            <p className="mt-0.5 text-xs">
              <StatusTag ev={ev} />
            </p>
          </div>
        )}
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
          {isArchive ? (
            <button
              onClick={() => setRepeat(ev)}
              className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('myEvents.repeat')}
            </button>
          ) : (
            <>
              <button
                onClick={() => setEdit(ev)}
                className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('myEvents.edit')}
              </button>
              {ev.status === 'active' && (
                <button
                  onClick={() => setRepeat(ev)}
                  className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t('myEvents.repeat')}
                </button>
              )}
            </>
          )}
          <button
            onClick={handleDelete}
            disabled={deletingId === ev.id}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 shadow hover:bg-red-100 disabled:opacity-50"
            title={t('myEvents.delete')}
            aria-label={t('myEvents.delete')}
          >
            {deletingId === ev.id ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            ) : (
              '🗑'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-3xl flex-1 p-4">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">{t('myEvents.title')}</h1>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('active')}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === 'active' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700'}`}
        >
          {t('myEvents.activeTab')}
        </button>
        <button
          onClick={() => setTab('archive')}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === 'archive' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700'}`}
        >
          {t('myEvents.archiveTab')} ({archive.length})
        </button>
      </div>

      {tab === 'active' ? (
        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : (
            events.length === 0 && <p className="text-sm text-gray-500">{t('myEvents.empty')}</p>
          )}
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : (
            archive.length === 0 && <p className="text-sm text-gray-500">{t('myEvents.archiveEmpty')}</p>
          )}
          {archive.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      {/* Форма повтора с данными события */}
      {repeat && (
        <EventForm
          categories={categories}
          event={repeat}
          onClose={() => {
            setRepeat(null);
            load();
          }}
        />
      )}

      {/* Редактирование карточки организатором (сохраняется на модерацию) */}
      {edit && (
        <EventForm
          categories={categories}
          editEvent={edit}
          onClose={() => {
            setEdit(null);
            load();
          }}
        />
      )}

      {/* Просмотр полной карточки архивного события */}
      {view && (
        <div
          className="fixed inset-0 z-[2000] overflow-y-auto bg-black/40 p-4"
          onClick={() => setView(null)}
        >
          <div
            className="glass-strong relative mx-auto my-6 w-full max-w-lg rounded-xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setView(null)}
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              ✕
            </button>
            <EventCard
              event={view}
              categories={categories}
              onClose={() => setView(null)}
              isAdmin={false}
              isOwner={true}
              onDelete={handleDeleteFromCard}
              favoriteIds={null}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
