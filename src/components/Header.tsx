// Шапка сайта: название, навигация по ролям, переключатель языка RU/EN,
// вход / меню шестерёнки.
// Навигация: пункты по ролям — в правом блоке шапки (все экраны),
// дублируются в меню шестерёнки.
// Войти: незарегистрированные. Шестерёнка с меню — для вошедших.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import AuthModal from './AuthModal';
import { getApi } from '../lib/api';
import { config } from '../config';

interface HeaderProps {
  /** Открыть форму создания события. Если не передано (страница без формы) —
   *  переходим на главную и открываем форму там. */
  onOpenForm?: () => void;
}

interface NavItem {
  label: string;
  action: () => void;
  /** Скрыть пункт из десктопной навигации шапки (в меню шестерёнки остаётся) */
  hideDesktop?: boolean;
}

export default function Header({ onOpenForm }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { user, signOut, deleteAccount } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  // Бейдж «движение по заявкам»: сколько событий организатора изменилось
  const [badge, setBadge] = useState(0);
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  // Бейдж уведомлений: org — движение по его событиям («Мои события»),
  // admin — события на модерации. Пересчитывается: при монтировании,
  // каждые 30 сек, при возврате вкладки и фокусе окна, по событиям
  // 'my-events-seen' (MyEvents) и 'moderation-seen' (Admin).
  const refreshBadge = useCallback(() => {
    getApi()
      .getMyEventsBadge()
      .then(setBadge)
      .catch(() => setBadge(0));
  }, []);

  useEffect(() => {
    // Гости и обычные пользователи бейдж не видят и таймеры не держат
    if (user?.role !== 'org' && user?.role !== 'admin') {
      setBadge(0);
      return;
    }
    refreshBadge();
    const timer = window.setInterval(refreshBadge, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshBadge();
    };
    const onFocus = () => refreshBadge();
    const onSeen = () => refreshBadge();
    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('my-events-seen', onSeen);
    window.addEventListener('moderation-seen', onSeen);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('my-events-seen', onSeen);
      window.removeEventListener('moderation-seen', onSeen);
    };
  }, [user, refreshBadge]);

  // Страница без формы: «Создать событие» переходит на главную,
  // флаг в sessionStorage открывает там форму.
  const openForm = onOpenForm ?? (() => {
    sessionStorage.setItem('events-map-open-form', '1');
    window.location.hash = '#/';
  });

  // Аккордеон: открытие меню шестерёнки закрывает панели главной
  useEffect(() => {
    if (menuOpen) window.dispatchEvent(new CustomEvent('close-home-panels'));
  }, [menuOpen]);
  // Закрываем меню, если открыли панель на главной (фильтры, список)
  useEffect(() => {
    const h = () => setMenuOpen(false);
    window.addEventListener('close-gear-menu', h);
    return () => window.removeEventListener('close-gear-menu', h);
  }, []);

  function switchLang() {
    const next = lang === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('events-map-lang', next);
  }

  function go(hash: string) {
    window.location.hash = hash;
    setMenuOpen(false);
  }

  // Пункты навигации по ролям (одни для шапки на десктопе и меню шестерёнки)
  const nav: NavItem[] = [];
  if (user) {
    if (user.role === 'admin') {
      nav.push(
        { label: t('menu.manage'), action: () => go('#/admin') },
        { label: t('menu.profile'), action: () => go('#/profile') },
      );
    } else if (user.role === 'org') {
      nav.push(
        { label: t('menu.myEvents'), action: () => go('#/my-events') },
        { label: t('menu.addEvent'), action: openForm, hideDesktop: true },
        { label: t('menu.favorites'), action: () => go('#/favorites') },
        { label: t('menu.profile'), action: () => go('#/profile') },
      );
    } else {
      nav.push(
        { label: t('menu.favorites'), action: () => go('#/favorites') },
        { label: t('menu.profile'), action: () => go('#/profile') },
      );
    }
  }

  // Удаление аккаунта: подтверждение, вызов RPC, при ошибке — сообщение
  async function onDeleteAccount() {
    if (!window.confirm(t('menu.deleteAccountConfirm'))) return;
    setMenuOpen(false);
    setBusyDelete(true);
    try {
      await deleteAccount();
      if (window.location.hash !== '#/') window.location.hash = '#/';
    } catch {
      window.alert(t('menu.deleteAccountError'));
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <header>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        {/* Название сайта — клик возвращает на карту */}
        <a href="#/" className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {t('app.title')}{' '}
            <span className="text-[10px] font-normal text-gray-400">{config.buildVersion}</span>
          </h1>
        </a>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
          {/* Навигация по ролям — видна на всех экранах (кроме hideDesktop) */}
          {nav.filter((n) => !n.hideDesktop).map((n) => (
            <button
              key={n.label}
              onClick={() => {
                setMenuOpen(false);
                n.action();
              }}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900"
            >
              {n.label}
            </button>
          ))}
          {/* Переключатель языка */}
          <button
            onClick={switchLang}
            className="rounded-md border border-gray-300 bg-white/70 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Switch language / Сменить язык"
          >
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>

          {!user ? (
            <button
              onClick={() => setAuthOpen(true)}
              className="glass-btn rounded-md px-3 py-1.5 text-sm font-semibold"
            >
              {t('app.login')}
            </button>
          ) : (
            <>
              {/* Колокольчик уведомлений: организатор — «Мои события»,
                  админ — «Модерация». Бейдж = число изменённых/новых */}
              {(user.role === 'org' || user.role === 'admin') && badge > 0 && (
                <button
                  onClick={() => go(user.role === 'org' ? '#/my-events' : '#/admin')}
                  className="glass-btn relative flex h-9 w-9 items-center justify-center rounded-full"
                  aria-label={t('menu.notifications')}
                  title={t('menu.notifications')}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="glass-btn flex h-9 w-9 items-center justify-center rounded-full"
                  aria-label={t('menu.title')}
                  title={t('menu.title')}
                >
                  {/* Шестерёнка */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>

              {menuOpen &&
                createPortal(
                  <>
                    <div className="fixed inset-0 z-[1290]" onClick={() => setMenuOpen(false)} />
                    <div className="glass fixed right-3 top-(--header-bottom) z-[1300] w-56 rounded-lg py-1 shadow-xl">
                    {nav.map((n) => (
                      <button
                        key={n.label}
                        onClick={() => {
                          setMenuOpen(false);
                          n.action();
                        }}
                        className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {n.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100" />
                    {/* Политика — видна в меню на мобильных (в шапке скрыта) */}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        go('#/privacy');
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                    >
                      {t('privacy.link')}
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        signOut();
                        if (window.location.hash !== '#/') window.location.hash = '#/';
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      {t('menu.logout')}
                    </button>
                    {user.role !== 'admin' && (
                      <button
                        onClick={onDeleteAccount}
                        disabled={busyDelete}
                        className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {t('menu.deleteAccount')}
                      </button>
                    )}
                  </div>
                  </>,
                  document.body,
                )}
            </div>
            </>
          )}
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </header>
  );
}
