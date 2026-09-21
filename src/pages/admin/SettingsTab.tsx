// Вкладка «Настройки»: email для уведомлений о модерации и автопубликация
// проверенных событий сборщика. Значения хранятся в app_settings
// (RPC get/set_notify_email, get/set_auto_publish).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';

export default function SettingsTab() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // Автопубликация событий сборщика
  const [autoPublish, setAutoPublish] = useState<'on' | 'off'>('on');
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState(false);
  const [autoStats, setAutoStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      try {
        const value = await api.getNotifyEmail();
        if (alive && value) setEmail(value);
      } catch {
        if (alive) {
          setStatus('error');
          setErrorMsg('Не удалось загрузить настройки');
        }
      }
      try {
        const mode = await api.getAutoPublish();
        if (alive) setAutoPublish(mode);
      } catch {
        /* настройки автопубликации недоступны — оставляем по умолчанию */
      }
      try {
        const stats = await api.getAutoModerationStats(7);
        if (alive) setAutoStats(stats);
      } catch {
        /* статистика необязательна */
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setStatus('idle');
    try {
      await getApi().setNotifyEmail(email.trim());
      setStatus('saved');
    } catch {
      setStatus('error');
      setErrorMsg('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAutoPublish(next: 'on' | 'off') {
    const prev = autoPublish;
    setAutoPublish(next);
    setAutoBusy(true);
    setAutoError(false);
    try {
      await getApi().setAutoPublish(next);
    } catch {
      setAutoPublish(prev);
      setAutoError(true);
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-gray-900">{t('admin.settingsTitle')}</h2>
      <form onSubmit={handleSave} className="max-w-md">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('admin.notifyEmail')}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setStatus('idle');
          }}
          disabled={loading}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="name@example.com"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || saving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? '...' : t('admin.saveEmail')}
          </button>
          {status === 'saved' && <span className="text-sm text-green-600">{t('admin.savedEmail')}</span>}
          {status === 'error' && <span className="text-sm text-red-600">{errorMsg}</span>}
        </div>
      </form>

      {/* Автопроверка и публикация собранных событий */}
      <div className="mt-8 max-w-md border-t border-gray-200 pt-5">
        <h3 className="mb-1 text-sm font-semibold text-gray-900">{t('admin.autoPublishTitle')}</h3>
        <p className="mb-3 text-xs leading-relaxed text-gray-500">{t('admin.autoPublishHint')}</p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={autoPublish === 'on'}
            disabled={loading || autoBusy}
            onChange={(e) => toggleAutoPublish(e.target.checked ? 'on' : 'off')}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm text-gray-700">{t('admin.autoPublishToggle')}</span>
        </label>
        {autoError && <p className="mt-2 text-sm text-red-600">{t('admin.autoPublishError')}</p>}
        {autoStats && (
          <p className="mt-3 text-xs text-gray-600">
            {t('admin.autoPublishStats', {
              publish: autoStats.publish ?? 0,
              review: autoStats.review ?? 0,
              reject: autoStats.reject ?? 0,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
