// Страница отписки от email-рассылки организатора (#/unsubscribe?token=...).
// Токен из письма — удаляет подписку; повторная рассылка не придёт.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';

export default function UnsubscribePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<'busy' | 'ok' | 'error'>('busy');

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const token = q.get('token') ?? '';
    if (!token) {
      if (alive) setState('error');
      return;
    }
    getApi()
      .unsubscribeOrg(token)
      .then(() => {
        if (alive) setState('ok');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-6">
        {state === 'busy' && <p className="text-sm text-gray-500">{t('common.loading')}</p>}
        {state === 'ok' && (
          <div className="w-full rounded-lg border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm font-medium text-gray-900">{t('org.unsubscribed')}</p>
            <a href="#/" className="mt-3 inline-block text-sm text-blue-600 underline">
              {t('auth.backToHome')}
            </a>
          </div>
        )}
        {state === 'error' && (
          <div className="w-full rounded-lg border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm text-red-700">{t('org.unsubError')}</p>
            <a href="#/" className="mt-3 inline-block text-sm text-blue-600 underline">
              {t('auth.backToHome')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
