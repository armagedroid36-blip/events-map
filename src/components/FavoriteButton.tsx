// Сердечко «в избранное»: переключатель сохранения события.
// Показывается только вошедшим пользователям (гостям его не рисуют
// родительские компоненты — FavoriteButton не содержит логики входа).
import { useTranslation } from 'react-i18next';

interface Props {
  /** Событие уже в избранном */
  active: boolean;
  /** Переключить состояние (вызывающий компонент делает запрос в API) */
  onToggle: () => void;
}

export default function FavoriteButton({ active, onToggle }: Props) {
  const { t } = useTranslation();
  const label = active ? t('card.removeFromFavorites') : t('card.addToFavorites');
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
        active
          ? 'bg-red-50 text-red-500 hover:bg-red-100'
          : 'text-gray-400 hover:bg-gray-100 hover:text-red-400'
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
