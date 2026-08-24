// Профиль (#/profile): email, роль, контакты организатора.
// Данные — из сессии (useAuth) и getMyProfile (роль + контакты из БД).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Profile } from '../lib/types';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (user) {
      getApi()
        .getMyProfile()
        .then(setProfile)
        .catch(() => setProfile(null));
    }
  }, [user]);

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

  // Контакты организатора (видны только ему)
  const contacts = profile
    ? [
        { label: t('profile.telegram'), value: profile.contact_telegram },
        { label: t('profile.whatsapp'), value: profile.contact_whatsapp },
        { label: t('profile.email'), value: profile.contact_email },
        { label: t('profile.phone'), value: profile.contact_phone },
        { label: t('profile.instagram'), value: profile.instagram },
      ].filter((c): c is { label: string; value: string } => Boolean(c.value))
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-xl flex-1 p-4">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">{t('profile.title')}</h1>

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

        {user.role === 'org' && contacts.length > 0 && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold text-gray-900">{t('profile.contacts')}</h2>
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.label} className="flex justify-between gap-3">
                  <span className="text-gray-500">{c.label}</span>
                  <span className="font-medium text-gray-900">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
