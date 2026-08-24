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

  async function load() {
    const [ev, ar, cats] = await Promise.all([
      getApi().listMyEvents(),
      getApi().listArchived(),
      getApi().getCategories(),
    ]);
    setEvents(ev);
    setArchive(ar);
    setCategories(cats);
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
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">
            {ev.title_ru || ev.title_en || ev.title}
          </p>
          <p className="text-xs text-gray-500">
            {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
          </p>
          {!isArchive && (
            <p className="mt-0.5 text-xs">
              <StatusTag ev={ev} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
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
          {events.length === 0 && <p className="text-sm text-gray-500">{t('myEvents.empty')}</p>}
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {archive.length === 0 && <p className="text-sm text-gray-500">{t('myEvents.archiveEmpty')}</p>}
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
      </div>
    </div>
  );
}
