// Избранное (#/favorites): заготовка страницы.
// Наполнение (сохранение событий в избранное) приходит отдельной задачей —
// пока страница показывает пустое состояние и общую шапку.
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { useAuth } from '../lib/auth';

export default function FavoritesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-3xl flex-1 p-6 text-center">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{t('favorites.title')}</h1>
        <p className="text-sm text-gray-500">
          {user ? t('favorites.empty') : t('favorites.accessDenied')}
        </p>
      </div>
    </div>
  );
}
