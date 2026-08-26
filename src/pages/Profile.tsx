// Профиль (#/profile): email, роль, контакты организатора (редактируемые),
// смена пароля. Доступен всем вошедшим (все роли).
// Контакты сохраняются через updateProfile, пароль — через updatePassword.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi, photoUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { contactErrors, normalizeContacts } from '../lib/contacts';
import type { ContactErrorCode, ContactField } from '../lib/contacts';

/** Полный URL аватарки: http/blob-ссылки как есть, пути хранилища через photoUrl */
function avatarDisplay(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') || url.startsWith('blob:') ? url : photoUrl(url);
}

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

  // Публичный профиль организатора (только role='org')
  const [orgName, setOrgName] = useState('');
  const [orgBio, setOrgBio] = useState('');
  const [contactsPublic, setContactsPublic] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
            setOrgName(p.display_name ?? '');
            setOrgBio(p.bio ?? '');
            setContactsPublic(p.contacts_public ?? false);
            setAvatarUrl(p.avatar_url ?? null);
            setAvatarPreview(avatarDisplay(p.avatar_url ?? null));
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

  /** Загрузка аватарки: файл → storage, превью показываем сразу */
  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const path = await getApi().uploadPhoto(file);
      setAvatarUrl(path);
      setAvatarPreview(avatarDisplay(path));
    } catch {
      setSaved(t('form.error'));
    }
  }

  /** Сохранение публичного профиля организатора (вместе с контактами) */
  async function saveOrgProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await getApi().updateProfile({
        telegram: tg,
        whatsapp: wa,
        email: em,
        phone: ph,
        instagram: ig,
        display_name: orgName.trim() || null,
        bio: orgBio.trim() || null,
        avatar_url: avatarUrl,
        contacts_public: contactsPublic,
      });
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

        {/* Профиль организатора — публичные поля (только организатор) */}
        {user.role === 'org' && (
          <form onSubmit={saveOrgProfile} className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-gray-900">{t('profile.orgBlockTitle')}</h2>
            <div>
              <label className="mb-1 block text-gray-600">{t('profile.avatar')}</label>
              <div className="flex items-center gap-3">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                    onError={() => setAvatarPreview(null)}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarChange}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('profile.uploadAvatar')}
                  </button>
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl(null);
                        setAvatarPreview(null);
                      }}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-gray-600">{t('profile.orgName')}</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-gray-600">{t('profile.orgBio')}</label>
              <textarea
                value={orgBio}
                onChange={(e) => setOrgBio(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
              />
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={contactsPublic}
                onChange={(e) => setContactsPublic(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-gray-900">{t('profile.contactsPublic')}</span>
                <span className="block text-xs text-gray-500">{t('profile.contactsPublicHint')}</span>
              </span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {busy ? '...' : t('profile.saveOrgProfile')}
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
