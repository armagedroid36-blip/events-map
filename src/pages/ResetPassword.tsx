// Страница сброса пароля (открывается по recovery-ссылке из письма
// восстановления: Supabase добавляет в hash #access_token=...&type=recovery).
// App.tsx замечает type=recovery при загрузке и рендерит эту страницу вместо
// роутинга. Важно: hash из URL supabase-js удаляет САМ (replaceState) —
// поэтому recovery не сбрасывается по hashchange, а только через onFinish.
// Форма: новый пароль (мин. 6) + подтверждение → updateUser (api.updatePassword).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function ResetPassword({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function goHome() {
    onFinish();
    window.location.hash = '#/';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (password.length < 6) {
      setErr(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setErr(t('auth.passwordsDontMatch'));
      return;
    }
    setBusy(true);
    try {
      await getApi().updatePassword(password);
      // Recovery-сессия одноразовая — выходим, чтобы пользователь вошёл с новым паролем
      await signOut().catch(() => {});
      setDone(true);
    } catch {
      // Нет сессии (просроченная ссылка) или серверная ошибка
      setErr(t('auth.resetLinkInvalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-md flex-1 p-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {done ? (
            <div className="space-y-4 text-center">
              <p className="rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-800">
                {t('auth.resetPasswordSuccess')}
              </p>
              <button
                onClick={goHome}
                className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
              >
                {t('auth.login')}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <h1 className="text-lg font-semibold text-gray-900">{t('auth.resetPasswordTitle')}</h1>
              <p className="text-sm text-gray-600">{t('auth.resetPasswordHint')}</p>
              <div>
                <label className="mb-1 block text-sm text-gray-600">{t('auth.newPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">{t('auth.confirmPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
              {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {busy ? '...' : t('auth.resetPasswordSubmit')}
              </button>
              <button
                type="button"
                onClick={goHome}
                className="block w-full text-center text-sm text-gray-500 underline hover:text-gray-700"
              >
                {t('auth.backToHome')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
