// Вкладка «Модерация»: список новых заявок организаторов.
// Принять (событие появляется на карте) / отклонить (с причиной) / отредактировать.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import type { Application, Category } from '../../lib/types';

interface Props {
  onChanged: () => void;
}

export default function ModerationTab({ onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const [apps, setApps] = useState<Application[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  // Раскрытое поле причины отклонения
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [aps, cats] = await Promise.all([api.listApplications(), api.getCategories()]);
      if (!alive) return;
      setApps(aps.filter((a) => a.status === 'new'));
      setCategories(cats);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function approve(id: string) {
    setBusyId(id);
    setMessage('');
    await getApi().approveApplication(id);
    setApps((xs) => xs.filter((x) => x.id !== id));
    setBusyId(null);
    setMessage(t('admin.moderation.approved'));
    onChanged();
  }

  async function reject(id: string) {
    setBusyId(id);
    setMessage('');
    await getApi().rejectApplication(id, rejectReason.trim());
    setApps((xs) => xs.filter((x) => x.id !== id));
    setBusyId(null);
    setRejectingId(null);
    setRejectReason('');
    setMessage(t('admin.moderation.rejected'));
    onChanged();
  }

  if (!apps.length) {
    return (
      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {t('admin.moderation.title')}
        </h2>
        {message && <p className="mb-3 text-sm text-green-700">{message}</p>}
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {t('admin.moderation.empty')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-gray-900">{t('admin.moderation.title')}</h2>
      {message && <p className="mb-3 text-sm text-green-700">{message}</p>}

      <div className="space-y-4">
        {apps.map((a) => {
          const cat = categories.find((c) => c.id === a.category_id);
          return (
            <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{a.title}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {cat ? `${cat.emoji} ${lang === 'ru' ? cat.name_ru : cat.name_en}` : ''}
                    {' • '}
                    {formatDate(a.start_date, lang)}
                    {a.end_date ? ` — ${formatDate(a.end_date, lang)}` : ''}
                    {' • '}
                    {a.city}
                  </p>
                </div>
                {a.contact && (
                  <span className="shrink-0 text-xs text-gray-400">
                    {t('admin.moderation.from', { contact: a.contact })}
                  </span>
                )}
              </div>

              {a.description && (
                <p className="mt-2 text-sm text-gray-600">{a.description}</p>
              )}
              {a.address && <p className="mt-1 text-xs text-gray-400">{a.address}</p>}
              {a.website && (
                <a
                  href={a.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm text-gray-900 underline underline-offset-2"
                >
                  {a.website}
                </a>
              )}

              {/* Кнопки решения */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => approve(a.id)}
                  disabled={busyId === a.id}
                  className="rounded-md bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
                >
                  {t('admin.moderation.approve')}
                </button>
                {rejectingId !== a.id ? (
                  <button
                    onClick={() => {
                      setRejectingId(a.id);
                      setRejectReason('');
                    }}
                    className="rounded-md border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    {t('admin.moderation.reject')}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t('admin.moderation.rejectReason')}
                      className="w-64 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => reject(a.id)}
                      disabled={busyId === a.id}
                      className="rounded-md bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {t('admin.moderation.rejectConfirm')}
                    </button>
                    <button
                      onClick={() => setRejectingId(null)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
