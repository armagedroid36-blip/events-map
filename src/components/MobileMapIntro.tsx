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
          был бы нечитаем), текстовые размеры/цвета заданы вариантами ниже. */}
      <div className="absolute inset-0 z-10 overflow-y-auto overscroll-contain">
        <div
          id="seo-intro-slot"
          className="relative px-5 text-gray-900 [&_a]:text-[#0f766e] [&_a]:underline [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:leading-tight [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_li]:text-sm [&_li]:leading-snug [&_li_time]:whitespace-nowrap [&_li_time]:text-gray-500 [&_nav]:text-xs [&_nav]:text-gray-500 [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-relaxed [&_ul]:mt-2 [&_ul]:space-y-1.5"
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
      <div
        className="pointer-events-none absolute inset-x-0 z-[15] h-8 bg-gradient-to-t from-[#faf7f2] to-transparent"
        style={{ bottom: BANNER_ZONE }}
      />

      {/* Нижняя зона: превью карты + затемнение + баннер (h2, подводка, кнопка).
          Прижата к низу экрана и не участвует в прокрутке. */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end px-5 pt-3"
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
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/10" />
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
