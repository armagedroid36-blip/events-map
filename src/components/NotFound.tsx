// Заглушка 404: неизвестный путь — простая страница, карта не показывается.
// Используется App (маршрут вне списка) и Home (посадочная страница
// «город × категория» без набора событий: пары с <MIN_CATEGORY_EVENTS
// событиями страницы не имеют — тот же гейт, что в пре-рендере).
import { useTranslation } from 'react-i18next';
import { navigate } from '../lib/navigate';

export default function NotFound() {
  const { i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <div className="text-lg font-semibold text-gray-900">
        {ru ? '404 — страница не найдена' : '404 — page not found'}
      </div>
      <button
        onClick={() => navigate(ru ? '/' : '/en')}
        className="rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
      >
        {ru ? 'На главную' : 'Back to map'}
      </button>
    </div>
  );
}
