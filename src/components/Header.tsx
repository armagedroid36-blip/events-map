// Шапка сайта: название, переключатель языка RU/EN, вход / меню шестерёнки.
// Войти: незарегистрированные. Шестерёнка с меню по ролям — для вошедших.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import AuthModal from './AuthModal';
import { config } from '../config';

interface HeaderProps {
  onOpenForm: () => void;
}

export default function Header({ onOpenForm }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

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

  // Пункты меню шестерёнки по ролям
  const menu: { label: string; action: () => void }[] = [];
  if (user) {
    if (user.role === 'admin') {
      menu.push(
        { label: t('menu.addEvent'), action: onOpenForm },
        { label: t('menu.manage'), action: () => go('#/admin') },
      );
    } else if (user.role === 'org') {
      menu.push(
        { label: t('menu.addEvent'), action: onOpenForm },
        { label: t('menu.myEvents'), action: () => go('#/my-events') },
        { label: t('menu.history'), action: () => go('#/history') },
      );
    } else {
      menu.push({ label: t('menu.history'), action: () => go('#/history') });
    }
  }

  return (
    <header>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        {/* Название сайта — клик возвращает на карту */}
        <a href="#/" className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {t('app.title')}{' '}
            <span className="text-[10px] font-normal text-gray-400">{config.buildVersion}</span>
          </h1>
        </a>

        <div className="flex shrink-0 items-center gap-2">
          {/* Переключатель языка */}
          <button
            onClick={switchLang}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                    <div className="glass fixed right-3 top-[80px] z-[1300] w-56 rounded-lg py-1 shadow-xl">
                    {menu.map((m) => (
                      <button
                        key={m.label}
                        onClick={() => {
                          setMenuOpen(false);
                          m.action();
                        }}
                        className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {m.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100" />
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
                  </div>
                  </>,
                  document.body,
                )}
            </div>
          )}
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </header>
  );
}
