// Окно входа / регистрации.
// Регистрация: выбор роли (пользователь / организатор).
// Организатор указывает контакты для связи (видит только админ).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { signIn, signUp, confirmSignup } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'user' | 'org'>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telegram, setTelegram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (mode === 'login') {
        const ok = await signIn(email, password);
        if (!ok) {
          setErr(t('auth.wrong'));
          setBusy(false);
          return;
        }
      } else {
        // Регистрация: отправляем запрос — на почту придёт код подтверждения
        await signUp(email, password, role, { telegram, whatsapp, email, phone });
        setConfirm(true);
        setBusy(false);
        return;
      }
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('auth.error'));
    }
    setBusy(false);
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const ok = await confirmSignup(email, code, role, { telegram, whatsapp, email, phone });
    setBusy(false);
    if (ok) onClose();
    else setErr(t('auth.wrongCode'));
  }

  // Шаг подтверждения кодом из письма
  if (confirm) {
    return createPortal(
      <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25" onClick={onClose}>
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="glass-strong w-full max-w-md rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{t('auth.confirmTitle')}</h2>
              <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">{t('auth.codeSent', { email })}</p>
            <form onSubmit={confirmCode} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600">{t('auth.code')}</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-center text-lg tracking-[0.5em] focus:border-gray-900 focus:outline-none"
                />
              </div>
              {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
              <button
                type="submit"
                disabled={busy || code.trim().length < 4}
                className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {busy ? '...' : t('auth.confirm')}
              </button>
            </form>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="glass-strong w-full max-w-md rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
            ✕
          </button>
        </div>

        {/* Переключение режима */}
        <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-1.5 ${mode === 'login' ? 'bg-white font-medium text-gray-900 shadow' : 'text-gray-500'}`}
          >
            {t('auth.login')}
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 rounded-md py-1.5 ${mode === 'register' ? 'bg-white font-medium text-gray-900 shadow' : 'text-gray-500'}`}
          >
            {t('auth.register')}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('auth.email')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('auth.password')}</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          {mode === 'register' && (
            <>
              {/* Выбор роли */}
              <div>
                <label className="mb-1 block text-sm text-gray-600">{t('auth.role')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('user')}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      role === 'user' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    {t('auth.roleUser')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('org')}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      role === 'org' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    {t('auth.roleOrg')}
                  </button>
                </div>
              </div>

              {/* Контакты организатора */}
              {role === 'org' && (
                <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{t('auth.orgContactsHint')}</p>
                  <input
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder={t('auth.contactTelegram')}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                  <input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder={t('auth.contactWhatsapp')}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('auth.contactPhone')}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </div>
              )}
            </>
          )}

          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? '...' : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
