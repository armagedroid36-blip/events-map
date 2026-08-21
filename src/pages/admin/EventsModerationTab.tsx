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
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Выбранное для просмотра событие
  const [selected, setSelected] = useState<EventItem | null>(null);
  // Событие в режиме редактирования
  const [editEvent, setEditEvent] = useState<EventItem | null>(null);
  // Подтверждение «Удалить все»
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Отклонение с комментарием
  const [rejectTarget, setRejectTarget] = useState<EventItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [evs, cats] = await Promise.all([api.listModerationEvents(), api.getCategories()]);
      if (!alive) return;
      setEvents(evs);
      setCategories(cats);
      setLoading(false);
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
    await getApi().rejectEvent(id, rejectReason);
    setEvents((xs) => xs.filter((x) => x.id !== id));
    setBusyId(null);
    setRejectTarget(null);
    setRejectReason('');
    onChanged();
  }

  /** Проблемы события — пустые/сомнительные поля, которые надо проверить. */
  function getIssues(ev: EventItem): string[] {
    const issues: string[] = [];
    if (!ev.description?.trim()) issues.push('noDescription');
    if (!ev.contact_telegram && !ev.contact_whatsapp && !ev.contact_email && !ev.contact_phone && !ev.contact_instagram && !ev.contact) {
      issues.push('noContacts');
    }
    if (!ev.address?.trim()) issues.push('noAddress');
    if (!ev.start_time) issues.push('noTime');
    if (!ev.photos?.length) issues.push('noPhotos');
    // Координаты приблизительные: адреса нет и нет ссылки на пост/сайт с картой
    // (типично для событий из Telegram-парсера)
    if (!ev.address?.trim() && !ev.website?.trim()) issues.push('approxCoords');
    return issues;
  }

  if (loading) {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        {t('common.loading')}
      </div>
    );
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
          const issues = getIssues(ev);
          return (
            <div
              key={ev.id}
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                onClick={() => setSelected(ev)}
                className="min-w-0 flex-1 text-left"
                title={t('admin.moderation.view')}
              >
                <p className="break-words font-medium text-gray-900 hover:underline sm:truncate">
                  {ev.title_ru || ev.title_en || ev.title}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
                  {cat ? ` • ${cat.emoji} ${cat.name_ru}` : ''}
                </p>
                {/* Проблемы события: что проверить (макс. 3) */}
                {issues.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {issues.slice(0, 3).map((issue) => (
                      <span
                        key={issue}
                        className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                      >
                        {t(`admin.moderation.${issue}`)}
                      </span>
                    ))}
                  </p>
                )}
                {/* Контакты организатора — видны только админу */}
                {(ev.contact_telegram || ev.contact_whatsapp || ev.contact_email || ev.contact_phone || ev.contact_instagram || ev.contact) && (
                  <p className="mt-1 break-all text-xs text-gray-600">
                    {[ev.contact_telegram && `TG: ${ev.contact_telegram}`, ev.contact_whatsapp && `WA: ${ev.contact_whatsapp}`, ev.contact_email && ev.contact_email, ev.contact_phone && ev.contact_phone, ev.contact_instagram && `IG: ${ev.contact_instagram}`, ev.contact && `Site: ${ev.contact}`]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                )}
              </button>
              <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
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
                  onClick={() => setRejectTarget(ev)}
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
          <div className="glass-strong relative mx-auto my-6 w-full max-w-lg rounded-xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              ✕
            </button>
            {/* Проблемы события: что проверить перед решением */}
            {getIssues(selected).length > 0 && (
              <div className="mb-3 rounded-md bg-amber-50 p-2.5">
                <p className="mb-1.5 text-xs font-semibold text-amber-800">
                  {t('admin.moderation.attention')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {getIssues(selected).map((issue) => (
                    <span
                      key={issue}
                      className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                    >
                      {t(`admin.moderation.${issue}`)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <EventCard event={selected} categories={categories} onClose={() => setSelected(null)} />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  const ev = selected;
                  setSelected(null);
                  setEditEvent(ev);
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('admin.moderation.edit')}
              </button>
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
                  setSelected(null);
                  setRejectTarget(selected);
                }}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                {t('admin.moderation.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Отклонение: причина обязательна */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[2100] overflow-y-auto bg-black/40 p-4" onClick={() => setRejectTarget(null)}>
          <div
            className="glass-strong mx-auto mt-24 w-full max-w-md rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-gray-900">
              {t('admin.moderation.rejectTitle')}
            </h3>
            <p className="mb-2 text-sm text-gray-600">
              {t('admin.moderation.rejectReason')}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="mb-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
              placeholder={t('admin.moderation.rejectPlaceholder')}
            />
            {!rejectReason.trim() && (
              <p className="mb-2 text-xs text-red-600">{t('admin.moderation.rejectRequired')}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => reject(rejectTarget.id)}
                disabled={busyId === rejectTarget.id || !rejectReason.trim()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
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
