// Мобильный приветственный экран страниц с картой (главная и города, <768px):
// статичный скриншот карты + баннер с описанием проекта и кнопкой «Открыть
// карту». Пока экран активен, живая карта (maplibre) НЕ монтируется — чанк и
// тайлы не запрашиваются (ключ к мобильному CWV). На десктопе (>=768px)
// компонент не рендерится вовсе (md:hidden + логика в Home.tsx).
//
// SEO-КОНТЕНТ НА ИНТРО (beta 1.14). main.tsx переносит статические блоки
// города/главной в #seo-intro-keep со скрытым классом — краулер их видел, а
// пользователь и Googlebot (mobile-first, ~411px) — нет: первый экран был
// декоративным. Теперь блок переезжает в слот #seo-intro-slot (прокручиваемая
// зона) и показывается: h1 города, вводный текст, «Ближайшие события», FAQ и
// ссылки категорий видны сразу. Баннер (превью карты + h2 + кнопка) остаётся
// прижатым к низу и не уезжает при прокрутке: контент скроллится ПОД ним.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { attachIntroSeoBlocks } from '../lib/mobileIntro';

type Props = {
  /** Путь к статичному превью карты (/images/map-preview-*.webp) */
  previewUrl: string;
  /** true — экран уходит (плавное затухание), клики отключены */
  leaving: boolean;
  /** Клик по кнопке «Открыть карту» */
  onOpen: () => void;
};

/** Высота нижней зоны с баннером; столько же — отступ снизу у слота, чтобы
 *  последний абзац можно было прокрутить выше баннера */
const BANNER_ZONE = '15rem';

export default function MobileMapIntro({ previewUrl, leaving, onOpen }: Props) {
  const { t } = useTranslation();
  // Показываем перенесённый статический SEO-блок (снимает hidden и кладёт
  // #seo-intro-keep в #seo-intro-slot). Повторный вызов безопасен.
  useEffect(() => {
    attachIntroSeoBlocks();
  }, []);
  return (
    <div
      className={`absolute inset-0 z-[1180] overflow-hidden bg-[#faf7f2] transition-opacity duration-500 ease-out md:hidden ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Слой с реальным SEO-контентом города/главной. Прокручивается под
          баннером; фон — #faf7f2 (у блока нет своих классов, текст на картинке
          был бы нечитаем). Стили — .intro-scroll / .seo-intro-slot в index.css:
          arbitrary-variant утилиты раздували критический CSS всех страниц. */}
      <div className="intro-scroll">
        <div
          id="seo-intro-slot"
          className="seo-intro-slot"
          style={{
            // 7.5rem — ниже плавающей шапки (её нижняя граница ~106px), иначе
            // хлебные крошки уезжают под стекло
            paddingTop: 'calc(7.5rem + env(safe-area-inset-top, 0px))',
            paddingBottom: `calc(${BANNER_ZONE} + env(safe-area-inset-bottom, 0px))`,
          }}
        />
      </div>

      {/* Мягкое затухание контента к баннеру: без него строка списка
          обрывается ровно по границе нижней зоны — выглядит как обрез */}
      <div className="intro-fade" style={{ bottom: BANNER_ZONE }} />

      {/* Нижняя зона: превью карты + затемнение + баннер (h2, подводка, кнопка).
          Прижата к низу экрана и не участвует в прокрутке. */}
      <div
        className="intro-banner"
        style={{
          minHeight: BANNER_ZONE,
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Фон зоны — статичный скриншот живой карты (картинка не «рабочая»,
            поэтому alt описывает карту, а не элементы управления) */}
        <img
          src={previewUrl}
          alt={t('mapIntro.imgAlt')}
          fetchPriority="high"
          className="intro-banner-bg"
        />
        <div className="intro-banner-shade" />
        <h2 className="max-w-[19rem] text-[23px] font-extrabold leading-tight tracking-tight text-white drop-shadow-md">
          {t('mapIntro.title')}
        </h2>
        <p className="mt-2 max-w-[19rem] text-[14px] leading-snug text-white/90 drop-shadow">
          {t('mapIntro.subtitle')}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 self-start rounded-full bg-[#E66343] px-6 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(230,99,67,0.45)] transition hover:bg-[#d4553a] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('mapIntro.open')}
        </button>
      </div>
    </div>
  );
}
