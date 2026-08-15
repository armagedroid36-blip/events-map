// Настройка i18next: два языка (русский/английский), определение языка браузера.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './ru';
import en from './en';

// Язык по умолчанию — определяется по языку браузера посетителя.
// Если браузер русскоязычный — сайт откроется на русском, иначе на английском.
function detectBrowserLanguage(): string {
  const lang = navigator.language?.toLowerCase() ?? '';
  return lang.startsWith('ru') ? 'ru' : 'en';
}

// Сохранение выбора посетителя (переключатель в шапке) в localStorage.
const saved = localStorage.getItem('events-map-lang');
const initialLang = saved ?? detectBrowserLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
