// Настройка i18next: два языка (русский/английский).
// ЕДИНЫЙ источник языка ПУБЛИЧНЫХ страниц — URL: путь /en/* → 'en',
// корневые пути → 'ru' (Googlebot ходит с en-US — язык браузера на
// публичных путях НЕ используется, иначе EN-контент отрендерился бы на
// RU-URL и получились бы дубли). Язык браузера/localStorage используется
// только на '/' с hash-разделами (личные кабинеты #/profile и пр.);
// переключатель в шапке меняет URL (navigate) и перезаписывает localStorage.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './ru';
import en from './en';

function initialLang(): string {
  const path = window.location.pathname;
  if (path === '/en' || path.startsWith('/en/') || path.startsWith('/en')) return 'en';
  // Личные hash-разделы на '/' и старые ссылки: прежнее поведение —
  // сохранённый выбор или язык браузера.
  if (path === '/' || path === '/index.html') {
    const saved = localStorage.getItem('events-map-lang');
    if (saved === 'ru' || saved === 'en') return saved;
    const nav = navigator.language?.toLowerCase() ?? '';
    return nav.startsWith('ru') ? 'ru' : 'en';
  }
  return 'ru';
}

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
