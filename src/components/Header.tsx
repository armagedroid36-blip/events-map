// Шапка сайта: название, переключатель языка RU/EN, кнопки действий.
import { useTranslation } from 'react-i18next';

interface Props {
  onOpenForm: () => void;
  onOpenAdmin: () => void;
}

export default function Header({ onOpenForm, onOpenAdmin }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  // Смена языка: мгновенно, без перезагрузки страницы; выбор сохраняется
  function switchLang() {
    const next = lang === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('events-map-lang', next);
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        {/* Название сайта */}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {t('app.title')}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Переключатель языка */}
          <button
            onClick={switchLang}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Switch language / Сменить язык"
          >
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>

          {/* Кнопка размещения события — главный канал привлечения клиентов */}
          <button
            onClick={onOpenForm}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            {t('app.submitEvent')}
          </button>

          {/* Ссылка на админку */}
          <button
            onClick={onOpenAdmin}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            {t('app.admin')}
          </button>
        </div>
      </div>
    </header>
  );
}
