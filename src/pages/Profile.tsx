// Профиль (#/profile): email, роль, контакты организатора (редактируемые),
// смена пароля. Доступен всем вошедшим (все роли).
// Контакты сохраняются через updateProfile, пароль — через updatePassword.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { contactErrors, normalizeContacts } from '../lib/contacts';
import type { ContactErrorCode, ContactField } from '../lib/contacts';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Поля контактов (предзаполняются из профиля)
  const [tg, setTg] = useState('');
  const [wa, setWa] = useState('');
  const [em, setEm] = useState('');
  const [ph, setPh] = useState('');
  const [ig, setIg] = useState('');
  // Ошибки валидации контактов (сбрасываются при вводе)
  const [contactErr, setContactErr] = useState<Partial<Record<ContactField, ContactErrorCode>>>({});

  // Смена пароля: новый пароль + подтверждение (без текущего — пользователь авторизован)
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Сообщение «Сохранено» (3 секунды)
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      getApi()
        .getMyProfile()
        .then((p) => {
          if (p) {
            setTg(p.contact_telegram ?? '');
            setWa(p.contact_whatsapp ?? '');
            setEm(p.contact_email ?? '');
            setPh(p.contact_phone ?? '');
            setIg(p.instagram ?? '');
          }
        })
        .catch(() => {});
    }
  }, [user]);

  // Автоскрытие сообщения «Сохранено»
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(''), 3000);
    return () => clearTimeout(id);
  }, [saved]);

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">
          {t('profile.accessDenied')}
        </div>
      </div>
    );
  }

  const roleLabel =
    user.role === 'admin'
      ? t('auth.roleAdmin')
      : user.role === 'org'
        ? t('auth.roleOrg')
        : t('auth.roleUser');

  /** Сохранение контактов организатора */
  async function saveContacts(e: React.FormEvent) {
    e.preventDefault();
    setContactErr({});
    const values = { telegram: tg, whatsapp: wa, email: em, phone: ph, instagram: ig };
    const errs = contactErrors(values);
    if (Object.keys(errs).length > 0) {
      setContactErr(errs);
      return;
    }
    setBusy(true);
    try {
      await getApi().updateProfile(normalizeContacts(values));
      setSaved(t('profile.saved'));
    } catch {
      setSaved(t('form.error'));
    } finally {
      setBusy(false);
    }
  }

  /** Смена пароля */
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr('');
    if (pw.length < 6) {
      setPwErr(t('profile.passwordTooShort'));
      return;
    }
    if (pw !== pw2) {
      setPwErr(t('profile.passwordsDontMatch'));
      return;
    }
    setBusy(true);
    try {
      await getApi().updatePassword(pw);
      setPw('');
      setPw2('');
      setSaved(t('profile.saved'));
    } catch {
      setSaved(t('form.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-xl flex-1 p-4">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">{t('profile.title')}</h1>

        {saved && (
          <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{saved}</p>
        )}

        {/* Email и роль */}
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('profile.email')}</span>
            <span className="font-medium text-gray-900">{user.email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">{t('profile.role')}</span>
            <span className="font-medium text-gray-900">{roleLabel}</span>
          </div>
        </div>

        {/* Контакты организатора — редактируются (только организатор) */}
        {user.role === 'org' && (
          <form onSubmit={saveContacts} className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-gray-900">{t('profile.contacts')}</h2>
            {(
              [
                ['telegram', tg, setTg, t('profile.telegram')],
                ['whatsapp', wa, setWa, t('profile.whatsapp')],
                ['email', em, setEm, t('profile.email')],
                ['phone', ph, setPh, t('profile.phone')],
                ['instagram', ig, setIg, t('profile.instagram')],
              ] as const
            ).map(([field, value, setter, label]) => (
              <div key={field}>
                <label className="mb-1 block text-gray-600">{label}</label>
                <input
                  type={field === 'email' ? 'email' : 'text'}
                  value={value}
                  onChange={(e) => {
                    setter(e.target.value);
                    setContactErr((prev) => ({ ...prev, [field]: undefined }));
                  }}
                  placeholder={label}
                  className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
                {contactErr[field] && (
                  <p className="mt-1 text-xs text-red-600">{t(`form.${contactErr[field]}`)}</p>
                )}
              </div>
            ))}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {busy ? '...' : t('profile.saveContacts')}
            </button>
          </form>
        )}

        {/* Смена пароля — всем ролям */}
        <form onSubmit={savePassword} className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-gray-900">{t('profile.changePassword')}</h2>
          <div>
            <label className="mb-1 block text-gray-600">{t('profile.newPassword')}</label>
            <input
              type="password"
              required
              minLength={6}
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setPwErr('');
              }}
              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-gray-600">{t('profile.confirmPassword')}</label>
            <input
              type="password"
              required
              minLength={6}
              value={pw2}
              onChange={(e) => {
                setPw2(e.target.value);
                setPwErr('');
              }}
              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          {pwErr && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{pwErr}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? '...' : t('profile.changePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
