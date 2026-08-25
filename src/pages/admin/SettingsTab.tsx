// Вкладка «Настройки»: email для уведомлений о модерации.
// Значение хранится в app_settings (RPC get/set_notify_email).
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const value = await getApi().getNotifyEmail();
        if (!alive) return;
        if (value) setEmail(value);
      } catch {
        if (alive) {
          setStatus('error');
          setErrorMsg('Не удалось загрузить настройки');
        }
      } finally {
        if (alive) setLoading(false);
      }
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
    </div>
  );
}
