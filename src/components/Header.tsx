// Шапка сайта: название, навигация по ролям, переключатель языка RU/EN,
// вход / меню.
// Навигация: пункты по ролям — в правом блоке шапки (все экраны),
// дублируются в меню.
// Войти: незарегистрированные. Кнопка меню — для вошедших.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import AuthModal from './AuthModal';
import { getApi } from '../lib/api';
import { config } from '../config';
import { navigate } from '../lib/navigate';

interface HeaderProps {
  /** Открыть форму создания события. Если не передано (страница без формы) —
   *  переходим на главную и открываем форму там. */
  onOpenForm?: () => void;
}

interface NavItem {
  label: string;
  action: () => void;
  /** Скрыть пункт из десктопной навигации шапки (в меню остаётся) */
  hideDesktop?: boolean;
  /** Скрыть из шапки на мобильных (портрет); в меню остаётся */
  hideMobile?: boolean;
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
  // Публичные пункты навигации — на языке интерфейса (EN-версии страниц
  // живут на /en/*; кнопки ведут на версию текущего языка — см. goBlog и др.)
  const navBlogLabel = lang === 'ru' ? 'Блог' : 'Blog';
  const navForOrgLabel = lang === 'ru' ? 'Для организаторов' : 'For organizers';
  const navAboutLabel = lang === 'ru' ? 'О проекте' : 'About';

  // Путь без хвостового слэша (нормализация как normPath в App.tsx). Бренд —
  // h1 только на главной «/» (и EN-главной «/en»): на городских страницах
  // (/bali, /da-nang, /nha-trang, их EN-версиях) единственный h1 даёт
  // городской SEO-блок (видимый текст в Home.tsx), иначе на странице было бы
  // два h1. Побочный эффект: на /event/... и /org/... бренд тоже не h1 —
  // там своих h1 пока нет.
  const cleanPath =
    window.location.pathname === '/index.html'
      ? '/'
      : window.location.pathname.replace(/\/+$/, '') || '/';
  const isBrandH1 = cleanPath === '/' || cleanPath === '/en';

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
    window.addEventListener('users-seen', onSeen);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('my-events-seen', onSeen);
      window.removeEventListener('moderation-seen', onSeen);
      window.removeEventListener('users-seen', onSeen);
    };
  }, [user, refreshBadge]);

  // Нижняя граница шапки + зазор — в CSS-переменную --header-bottom.
  // Меню — portal в body и позиционируется по этой переменной
  // (top-(--header-bottom)). Раньше её ставил только Home, поэтому на
  // остальных страницах (my-events, favorites, profile, admin) переменной
  // не было и меню уезжало вниз документа. Header меряет себя сам —
  // переменная есть на любой странице с шапкой. На главной эффект Home
  // (родитель) выполняется позже и перезапишет значение с учётом
  // плавающей обёртки — layout главной не меняется.
  const headerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      const bottom = Math.round(el.getBoundingClientRect().bottom) + 12;
      document.documentElement.style.setProperty('--header-bottom', `${bottom}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Страховка: шрифты и layout могут доехать позже первого замера
    window.addEventListener('load', update);
    window.addEventListener('resize', update);
    const t1 = window.setTimeout(update, 300);
    const t2 = window.setTimeout(update, 1200);
    return () => {
      ro.disconnect();
      window.removeEventListener('load', update);
      window.removeEventListener('resize', update);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.documentElement.style.removeProperty('--header-bottom');
    };
  }, []);

  /** Возврат на главную (карту): с чистого пути — navigate на главную
   *  ТЕКУЩЕГО языка ('/en' при EN-интерфейсе), на '/' — hash '#/' как раньше */
  function goHome() {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      navigate(lang === 'en' ? '/en' : '/');
      return;
    }
    if (window.location.hash !== '#/') window.location.hash = '#/';
  }

  /** Переход в блог: на /en/blog при EN-интерфейсе, иначе /blog */
  function goBlog() {
    navigate(lang === 'en' ? '/en/blog' : '/blog');
    setMenuOpen(false);
  }

  /** Переход на B2B-страницу: /en/for-organizers при EN, иначе /for-organizers */
  function goForOrganizers() {
    navigate(lang === 'en' ? '/en/for-organizers' : '/for-organizers');
    setMenuOpen(false);
  }

  /** Переход на страницу /about (EN — /en/about) */
  function goAbout() {
    navigate(lang === 'en' ? '/en/about' : '/about');
    setMenuOpen(false);
  }

  // Страница без формы: «Создать событие» переходит на главную,
  // флаг в sessionStorage открывает там форму.
  const openForm = onOpenForm ?? (() => {
    sessionStorage.setItem('events-map-open-form', '1');
    goHome();
  });

  // Аккордеон: открытие меню закрывает панели главной
  useEffect(() => {
    if (menuOpen) window.dispatchEvent(new CustomEvent('close-home-panels'));
  }, [menuOpen]);
  // Закрываем меню, если открыли панель на главной (фильтры, список)
  useEffect(() => {
    const h = () => setMenuOpen(false);
    window.addEventListener('close-gear-menu', h);
    return () => window.removeEventListener('close-gear-menu', h);
  }, []);

  /** Переключение языка: EN-версии публичных страниц живут на /en/*, поэтому
   *  на путях с парой меняем URL (navigate) + язык интерфейса; пути без
   *  EN-версии (личные hash-разделы на '/', /org/<id>, RU-событие без
   *  перевода) — только i18n.changeLanguage, URL не трогаем. Автонавигации
   *  по языку браузера НЕТ — только явный клик переключателя. */
  function switchLang() {
    const next = lang === 'ru' ? 'en' : 'ru';
    const path = window.location.pathname;
    const hash = window.location.hash;
    const isEnNow = path === '/en' || path.startsWith('/en/');
    i18n.changeLanguage(next);
    localStorage.setItem('events-map-lang', next);
    // Личные hash-разделы (#/profile и пр.) и события/организаторы без
    // EN-версии: переключаем только язык интерфейса, URL не трогаем.
    // '/' с картой (hash пуст или '#/') — публичная RU-главная, у неё есть
    // EN-версия /en — меняем URL.
    const isPrivateHash = hash.startsWith('#/') && hash !== '#/' && hash !== '#';
    if ((path === '/' || path === '/index.html') && !isPrivateHash) {
      if (next === 'en') navigate('/en');
      return;
    }
    if (path === '/' || path === '/index.html' || path.startsWith('/event/') || path.startsWith('/org/')) {
      return;
    }
    // Публичный путь с EN-версией: убираем/добавляем префикс /en
    if (!isEnNow && next === 'en') {
      navigate(`/en${path}`);
    } else if (isEnNow && next === 'ru') {
      const target = path.replace(/^\/en/, '');
      navigate(target === '' ? '/' : target);
    }
  }

  // Переход в личный (hash-)раздел: #/profile, #/admin и т.п.
  // С чистого пути (например /bali) сначала уходим на '/' с этим hash —
  // hash-логика App работает только на '/'
  function go(hash: string) {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      navigate(`/${hash}`);
    } else {
      window.location.hash = hash;
    }
    setMenuOpen(false);
  }

  // Пункты навигации по ролям (одни для шапки на десктопе и меню)
  const nav: NavItem[] = [];
  if (user) {
    if (user.role === 'admin') {
      nav.push(
        { label: t('menu.manage'), action: () => go('#/admin'), hideMobile: true },
        { label: t('menu.profile'), action: () => go('#/profile'), hideDesktop: true },
      );
    } else if (user.role === 'org') {
      nav.push(
        { label: t('menu.myEvents'), action: () => go('#/my-events'), hideMobile: true },
        { label: t('menu.addEvent'), action: openForm, hideDesktop: true },
        { label: t('menu.favorites'), action: () => go('#/favorites'), hideMobile: true },
        { label: t('menu.profile'), action: () => go('#/profile'), hideDesktop: true },
      );
    } else {
      nav.push(
        { label: t('menu.favorites'), action: () => go('#/favorites'), hideMobile: true },
        { label: t('menu.profile'), action: () => go('#/profile'), hideDesktop: true },
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
      goHome();
    } catch {
      window.alert(t('menu.deleteAccountError'));
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <header ref={headerRef}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-2 pr-4">
        {/* Название сайта — клик возвращает на карту.
            flex-1 min-w-0: при появлении бейджа уведомлений (колокольчик)
            правый блок становится шире — название сжимается (truncate),
            шапка остаётся в одну строку. */}
        <a
          href="#/"
          onClick={(e) => {
            // С чистого пути (например /bali или /event/...) — возврат на
            // главную ТЕКУЩЕГО языка через navigate (EN — /en); на '/'
            // работает обычный hash-переход
            if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
              e.preventDefault();
              navigate(lang === 'en' ? '/en' : '/');
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-[3px]"
        >
          {/* Логотип — клик тоже возвращает на карту (внутри ссылки).
              Абсолютный путь от корня: сайт живёт на корневом домене
              (mypins.site), а на вложенных чистых URL (/bali, /event/<id>/...)
              относительный src ушёл бы в подпапку маршрута и дал 404.
              logo-mark.png — логотип БЕЗ прозрачных полей (обрезан по пину):
              в logo.png пин занимает лишь ~34% ширины файла, из-за полей
              визуальный зазор до надписи не зависит от gap.
              h-12 + py-1.5 контейнера: пин почти во всю высоту шапки
              (48 + 12 = 60px — как раньше h-9 + py-3), шапка не растёт. */}
          <img src="/logo-mark.png" alt="" className="h-12 w-auto shrink-0 rounded object-contain" />
          {isBrandH1 ? (
            <h1 className="truncate text-xl font-extrabold tracking-tight text-gray-900">
              {t('app.brand')}{' '}
              <span className="text-[10px] font-normal text-gray-400">{config.buildVersion}</span>
            </h1>
          ) : (
            <span className="block truncate text-xl font-extrabold tracking-tight text-gray-900">
              {t('app.brand')}{' '}
              <span className="text-[10px] font-normal text-gray-400">{config.buildVersion}</span>
            </span>
          )}
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
              className={`rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900${n.hideMobile ? ' hidden sm:block' : ''}`}
            >
              {n.label}
            </button>
          ))}
          {/* «Блог» — публичные статьи. На <640px скрыт здесь: пункты публичной
              навигации вынесены в нижнюю строку шапки (см. ряд 2 ниже),
              иначе кнопки не помещаются рядом с брендом и flex-wrap
              переносит их вразнобой. С sm+ — виден всегда. */}
          <button
            onClick={goBlog}
            className="hidden rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900 sm:block"
          >
            {navBlogLabel}
          </button>
          {/* «Для организаторов» — публичная B2B-страница (та же видимость,
              что у «Блога»: скрыт на <640px, в нижней строке) */}
          <button
            onClick={goForOrganizers}
            className="hidden rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900 sm:block"
          >
            {navForOrgLabel}
          </button>
          {/* «О проекте» — публичная E-E-A-T-страница (та же видимость,
              что у «Блога»: скрыт на <640px, в нижней строке) */}
          <button
            onClick={goAbout}
            className="hidden rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900 sm:block"
          >
            {navAboutLabel}
          </button>
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
                  {/* Бургер (меню) */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
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
                    {/* Публичные пункты на <640px скрыты: они в нижней
                        строке шапки (ряд 2) — дублей на одном экране нет.
                        С sm+ видны в меню как раньше (в шапке они тоже
                        видны — так было до переноса) */}
                    <button
                      onClick={goBlog}
                      className="hidden w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:block"
                    >
                      {navBlogLabel}
                    </button>
                    <button
                      onClick={goForOrganizers}
                      className="hidden w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:block"
                    >
                      {navForOrgLabel}
                    </button>
                    <button
                      onClick={goAbout}
                      className="hidden w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:block"
                    >
                      {navAboutLabel}
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                    {/* Политика и Контакты — видны в меню на мобильных (в шапке скрыты) */}
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
                        go('#/contacts');
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                    >
                      {t('contacts.link')}
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        signOut();
                        goHome();
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

      {/* Ряд 2 — только на <640px (sm:hidden): публичная навигация
          «Блог» / «Для организаторов» / «О проекте». Видна гостю и
          вошедшему (у вошедшего эти пункты на мобильном из бургер-меню
          убраны — без дублей на одном экране). Ряд 1 остаётся в одну
          строку: бренд слева (truncate), справа только язык + «Войти»
          либо язык + колокольчик/бургер. С sm+ ряд 2 скрыт, а пункты
          снова в правой группе шапки (см. выше). Высота шапки меряется
          ResizeObserver'ом в useLayoutEffect — бургер-меню и панели
          Home позиционируются по --header-bottom ниже ОБЕИХ строк. */}
      <div className="flex flex-wrap items-center justify-center gap-1 px-2 pb-2 sm:hidden">
        <button
          onClick={goBlog}
          className="rounded-md px-2 py-1 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900"
        >
          {navBlogLabel}
        </button>
        <button
          onClick={goForOrganizers}
          className="rounded-md px-2 py-1 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900"
        >
          {navForOrgLabel}
        </button>
        <button
          onClick={goAbout}
          className="rounded-md px-2 py-1 text-sm font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900"
        >
          {navAboutLabel}
        </button>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </header>
  );
}
