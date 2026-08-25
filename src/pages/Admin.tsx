// Админ-панель (/admin).
// В демо-режиме вход пропускается; с реальной Supabase — вход по email/паролю
// (Supabase Auth, роль — администратор).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { config } from '../config';
import StatsTab from './admin/StatsTab';
import ModerationTab from './admin/ModerationTab';
import EventsModerationTab from './admin/EventsModerationTab';
import EventsTab from './admin/EventsTab';
import CategoriesTab from './admin/CategoriesTab';
import ImportTab from './admin/ImportTab';
import ArchiveTab from './admin/ArchiveTab';

type Tab = 'stats' | 'moderation' | 'events' | 'categories' | 'import' | 'archive';

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [authed, setAuthed] = useState(config.demoMode);
  const [tab, setTab] = useState<Tab>('stats');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  // Счётчик обновления данных после действий (модерация, CRUD, импорт)
  const [version, setVersion] = useState(0);

  // Вошедший администратор попадает в админку сразу, без второго входа
  useEffect(() => {
    if (user?.role === 'admin') setAuthed(true);
  }, [user]);

  // Открытие вкладки «Модерация» сбрасывает бейдж уведомлений:
  // отмечаем просмотр и сообщаем Header (событие 'moderation-seen')
  useEffect(() => {
    if (tab === 'moderation' && user?.role === 'admin') {
      getApi()
        .markModerationSeen()
        .then(() => window.dispatchEvent(new CustomEvent('moderation-seen')))
        .catch(() => {});
    }
  }, [tab, user]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginErr('');
    const ok = await getApi().adminLogin(email, password);
    setLoginBusy(false);
    if (ok) setAuthed(true);
    else setLoginErr(t('admin.wrongCredentials'));
  }

  // --- Экран входа ---
  if (!authed) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header onOpenForm={() => (window.location.hash = '#/')} />
        <div className="flex flex-1 items-center justify-center p-4">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h1 className="mb-1 text-lg font-semibold text-gray-900">{t('admin.login')}</h1>
            <p className="mb-4 text-xs text-gray-500">{t('admin.loginHint')}</p>
            {loginErr && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loginErr}</p>
            )}
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('admin.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loginBusy}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loginBusy ? t('common.loading') : t('admin.signIn')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'stats', label: t('admin.nav.stats') },
    { id: 'moderation', label: t('admin.nav.moderation') },
    { id: 'events', label: t('admin.nav.events') },
    { id: 'archive', label: t('admin.nav.archive') },
    { id: 'categories', label: t('admin.nav.categories') },
    { id: 'import', label: t('admin.nav.import') },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header onOpenForm={() => (window.location.hash = '#/')} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">
        {/* Вкладки админки */}
        <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200 pb-2">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === x.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {x.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => (window.location.hash = '#/')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              ← {t('app.title')}
            </button>
            <button
              onClick={() => {
                setAuthed(false);
                setTab('stats');
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              {t('admin.signOut')}
            </button>
          </div>
        </div>

        {tab === 'stats' && <StatsTab version={version} />}
        {tab === 'moderation' && (
          <>
            <EventsModerationTab onChanged={() => setVersion((v) => v + 1)} />
            <ModerationTab onChanged={() => setVersion((v) => v + 1)} />
          </>
        )}
        {tab === 'events' && <EventsTab version={version} onChanged={() => setVersion((v) => v + 1)} />}
        {tab === 'archive' && <ArchiveTab />}
        {tab === 'categories' && <CategoriesTab onChanged={() => setVersion((v) => v + 1)} />}
        {tab === 'import' && <ImportTab onChanged={() => setVersion((v) => v + 1)} />}
      </div>
    </div>
  );
}
