// Мобильный приветственный экран страниц с картой (главная и города, <768px):
// статичный скриншот карты + баннер с описанием проекта и кнопкой «Открыть
// карту». Пока экран активен, живая карта (maplibre) НЕ монтируется — чанк и
// тайлы не запрашиваются (ключ к мобильному CWV). На десктопе (>=768px)
// компонент не рендерится вовсе (md:hidden + логика в Home.tsx).
import { useTranslation } from 'react-i18next';

type Props = {
  /** Путь к статичному превью карты (/images/map-preview-*.webp) */
  previewUrl: string;
  /** true — экран уходит (плавное затухание), клики отключены */
  leaving: boolean;
  /** Клик по кнопке «Открыть карту» */
  onOpen: () => void;
};

export default function MobileMapIntro({ previewUrl, leaving, onOpen }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={`absolute inset-0 z-[1180] overflow-hidden bg-[#faf7f2] transition-opacity duration-500 ease-out md:hidden ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Фон — статичный скриншот живой карты (картинка не «рабочая», поэтому
          alt описывает карту, а не элементы управления) */}
      <img
        src={previewUrl}
        alt={t('mapIntro.imgAlt')}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Лёгкое затемнение снизу вверх — читаемость текста баннера */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />
      <div
        className="absolute inset-x-0 bottom-0 px-6"
        style={{ paddingBottom: 'calc(2.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <h2 className="max-w-[19rem] text-[27px] font-extrabold leading-tight tracking-tight text-white drop-shadow-md">
          {t('mapIntro.title')}
        </h2>
        <p className="mt-2.5 max-w-[17.5rem] text-[15px] leading-snug text-white/90 drop-shadow">
          {t('mapIntro.subtitle')}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-6 rounded-full bg-[#E66343] px-7 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(230,99,67,0.45)] transition hover:bg-[#d4553a] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('mapIntro.open')}
        </button>
      </div>
    </div>
  );
}
