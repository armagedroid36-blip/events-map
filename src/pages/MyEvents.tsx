// «Мои мероприятия» — личный кабинет организатора.
// Вкладки: активные (и их статус) и архив (прошедшие) с кнопкой «Повторить».
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EventItem } from '../lib/types';
import { formatDate } from '../lib/dates';

export default function MyEvents() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [archive, setArchive] = useState<EventItem[]>([]);
  const [repeatId, setRepeatId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [ev, ar] = await Promise.all([getApi().listMyEvents(), getApi().listArchived()]);
    setEvents(ev);
    setArchive(ar);
  }

  useEffect(() => {
    if (user?.role === 'org') load();
  }, [user]);

  if (!user || user.role !== 'org') {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-gray-500">
        {t('myEvents.accessDenied')}
      </div>
    );
  }

  async function doRepeat() {
    if (!repeatId || !startDate) return;
    setBusy(true);
    try {
      await getApi().repeatEvent(repeatId, startDate, endDate || undefined);
      setRepeatId(null);
      setStartDate('');
      setEndDate('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const statusLabel: Record<string, string> = {
    active: t('myEvents.statusActive'),
    moderation: t('myEvents.statusModeration'),
    rejected: t('myEvents.statusRejected'),
  };

  function EventRow({ ev }: { ev: EventItem }) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">
            {ev.title_ru || ev.title_en || ev.title}
          </p>
          <p className="text-xs text-gray-500">
            {formatDate(ev.start_date)} {ev.end_date ? `— ${formatDate(ev.end_date)}` : ''} • {ev.city}
          </p>
          {ev.status !== 'archived' && (
            <p className="mt-0.5 text-xs">
              {ev.status === 'active' ? (
                <span className="text-green-600">{statusLabel.active}</span>
              ) : ev.status === 'moderation' ? (
                <span className="text-amber-600">{statusLabel.moderation}</span>
              ) : (
                <span className="text-red-600">{statusLabel.rejected}</span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setRepeatId(ev.id);
            setStartDate('');
            setEndDate('');
          }}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t('myEvents.repeat')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
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

      {/* Модалка повторения */}
      {repeatId && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={() => setRepeatId(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('myEvents.repeatTitle')}</h2>
            <label className="mb-1 block text-sm text-gray-600">{t('myEvents.startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm"
            />
            <label className="mb-1 block text-sm text-gray-600">{t('myEvents.endDate')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mb-4 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm"
            />
            <button
              onClick={doRepeat}
              disabled={busy || !startDate}
              className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {busy ? '...' : t('myEvents.repeatConfirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
