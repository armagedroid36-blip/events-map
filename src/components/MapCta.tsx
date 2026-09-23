// Кнопка «Посмотреть события на карте» для публичных «текстовых» страниц:
// /blog, статей /blog/<slug>, «О проекте» /about и «Для организаторов»
// /for-organizers. На эти страницы приходят из поиска (Google), и раньше
// заметного пути на саму карту не было — только клик по названию сайта в
// шапке. Компонент ставится сразу под вводным блоком страницы (выше первого
// экрана текста) и повторяется в конце статьи.
// href — КАНОНИЧЕСКИЙ URL карты текущего языка (со слэшем, как в шапке,
// canonical и пре-рендере: GitHub Pages делает 301 с версии без слэша).
// Переход по клику — SPA-шный: относительные ссылки перехватывает
// document-обработчик App.tsx (navigate, без перезагрузки), поэтому свой
// onClick здесь не нужен. Классы — существующий CTA-стиль проекта (тот же,
// что у кнопки «Создать событие» на /for-organizers).
import { useTranslation } from 'react-i18next';

interface MapCtaProps {
  /** Дополнительные классы обёртки (отступы зависят от места на странице) */
  className?: string;
}

export default function MapCta({ className = 'mt-4' }: MapCtaProps) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  return (
    <p className={className}>
      <a
        href={en ? '/en/' : '/'}
        className="inline-block rounded-md bg-[#72D2CF] px-4 py-2 text-sm font-semibold text-black shadow hover:bg-[#61B2B0]"
      >
        {en ? 'See events on the map' : 'Посмотреть события на карте'}
      </a>
    </p>
  );
}
