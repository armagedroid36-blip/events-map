// «История» — просмотренные пользователем события.
// Можно очистить всю историю или удалить события по отдельности.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi, photoUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { HistoryItem, EventItem } from '../lib/types';

interface HistoryRow extends HistoryItem {
  events: EventItem | EventItem[] | null;
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);

  async function load() {
    const h = (await getApi().listHistory()) as HistoryRow[];
    setRows(h);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (!user) {
    return <div className="mx-auto max-w-3xl p-6 text-center text-gray-500">{t('history.accessDenied')}</div>;
  }

  function evOf(row: HistoryRow): EventItem | null {
    const e = row.events;
    if (Array.isArray(e)) return e[0] ?? null;
    return e;
  }

  async function clearAll() {
    await getApi().clearHistory();
    setRows([]);
  }

  async function remove(id: string) {
    await getApi().removeHistory(id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{t('history.title')}</h1>
        {rows.length > 0 && (
          <button
            onClick={clearAll}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            {t('history.clearAll')}
          </button>
        )}
      </div>

      {rows.length === 0 && <p className="text-sm text-gray-500">{t('history.empty')}</p>}

      <div className="space-y-2">
        {rows.map((row) => {
          const ev = evOf(row);
          if (!ev) return null;
          const firstPhoto = ev.photos?.[0];
          return (
            <div key={row.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
              {firstPhoto ? (
                <img
                  src={firstPhoto.startsWith('http') ? firstPhoto : photoUrl(firstPhoto)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-md bg-gray-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">
                  {ev.title_ru || ev.title_en || ev.title}
                </p>
                <p className="text-xs text-gray-500">{ev.city}</p>
              </div>
              <button
                onClick={() => remove(row.id)}
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                title={t('history.remove')}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
