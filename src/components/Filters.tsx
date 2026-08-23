// Панель фильтров: категория, период, город, цена, валюта, язык, ключевые слова.
import { useTranslation } from 'react-i18next';
import type { Category, Filters } from '../lib/types';
import { LANGUAGES } from '../lib/languages';
import { COUNTRY_NAMES, KNOWN_COUNTRIES, detectCountry } from '../lib/countries';
import { todayIso } from '../lib/dates';

interface Props {
  categories: Category[];
  filters: Filters;
  onChange: (f: Filters) => void;
  /** Города из базы — для автодополнения */
  cities?: string[];
  /** Страны из базы — для фильтра (канонические коды, возможно 'other') */
  countries?: string[];
  /** Применить фильтры по кнопке «Найти» */
  onApply?: () => void;
  /** Сбросить фильтры (в т.ч. уже применённые) */
  onReset?: () => void;
}

/** Пустой набор фильтров (для кнопки «Сбросить») */
const EMPTY_FILTERS: Filters = {
  categoryId: null,
  date: undefined,
  price: 'any',
  priceMin: undefined,
  priceMax: undefined,
  currency: null,
  language: null,
  country: null,
  city: undefined,
  query: undefined,
};

export default function FiltersPanel({
  categories,
  filters,
  onChange,
  cities = [],
  countries = [],
  onApply,
  onReset,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  // Страны: известные + встреченные в базе, без повторов, с названием на
  // языке интерфейса; «Другие» — события, страну которых не определили.
  const countryList = [...new Set([...countries, ...KNOWN_COUNTRIES])].sort((a, b) => {
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    const na = COUNTRY_NAMES[a]?.[lang] ?? a;
    const nb = COUNTRY_NAMES[b]?.[lang] ?? b;
    return na.localeCompare(nb);
  });

  // Города только выбранной страны (при «Любая страна» — все города базы).
  // Города без страны в справочнике видны только при «Любая страна» и «Другие».
  const cityOptions = filters.country
    ? cities.filter(
        (c) =>
          (filters.country === 'other' ? '' : filters.country) === detectCountry(c),
      )
    : cities;

  return (
    <div className="space-y-3 rounded-lg p-3">
      <h2 className="text-sm font-semibold text-gray-900">{t('filters.title')}</h2>

      {/* Категория */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.category')}</label>
        <select
          value={filters.categoryId ?? ''}
          onChange={(e) => set('categoryId', e.target.value || null)}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        >
          <option value="">{t('filters.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {lang === 'ru' ? c.name_ru : c.name_en}
            </option>
          ))}
        </select>
      </div>

      {/* Дата: сегодня / завтра / конкретная дата */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.date')}</label>
        <div className="flex gap-2">
          <button
            onClick={() => set('date', filters.date === 'today' ? undefined : 'today')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
              filters.date === 'today'
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-400 text-gray-700 hover:border-gray-500 hover:bg-gray-50'
            }`}
          >
            {t('filters.today')}
          </button>
          <button
            onClick={() => set('date', filters.date === 'tomorrow' ? undefined : 'tomorrow')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
              filters.date === 'tomorrow'
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-400 text-gray-700 hover:border-gray-500 hover:bg-gray-50'
            }`}
          >
            {t('filters.tomorrow')}
          </button>
        </div>
        <input
          type="date"
          min={todayIso()}
          value={
            filters.date && filters.date !== 'today' && filters.date !== 'tomorrow'
              ? filters.date
              : ''
          }
          onChange={(e) => set('date', e.target.value || undefined)}
          placeholder={t('filters.datePlaceholder')}
          className="mt-2 w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        />
      </div>

      {/* Страна */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.country')}</label>
        <select
          value={filters.country ?? ''}
          onChange={(e) => set('country', e.target.value || null)}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        >
          <option value="">{t('filters.anyCountry')}</option>
          {countryList.map((code) => (
            <option key={code} value={code}>
              {code === 'other'
                ? t('filters.other')
                : (COUNTRY_NAMES[code]?.[lang] ?? code)}
            </option>
          ))}
        </select>
      </div>

      {/* Город (с автодополнением из базы) */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.city')}</label>
        <input
          list="city-options"
          value={filters.city ?? ''}
          onChange={(e) => set('city', e.target.value || undefined)}
          placeholder={t('filters.cityPlaceholder')}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        />
        <datalist id="city-options">
          {cityOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {/* Цена */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.price')}</label>
        <select
          value={filters.price}
          onChange={(e) => set('price', e.target.value as 'any' | 'free' | 'paid')}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        >
          <option value="any">{t('filters.anyPrice')}</option>
          <option value="free">{t('filters.freeOnly')}</option>
          <option value="paid">{t('filters.paidOnly')}</option>
          <option value="donation">{t('filters.donationOnly')}</option>
        </select>
        {/* Диапазон цены (применяется к платным) */}
        {filters.price !== 'free' && filters.price !== 'donation' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-gray-400">{t('filters.priceFrom')}</label>
              <input
                type="number"
                min="0"
                value={filters.priceMin ?? ''}
                onChange={(e) => set('priceMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-gray-400">{t('filters.priceTo')}</label>
              <input
                type="number"
                min="0"
                value={filters.priceMax ?? ''}
                onChange={(e) => set('priceMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
              />
            </div>
          </div>
        )}
        {/* Валюта */}
        {filters.price !== 'free' && filters.price !== 'donation' && (
          <div className="mt-2">
            <label className="mb-0.5 block text-[11px] text-gray-400">{t('filters.currency')}</label>
            <select
              value={filters.currency ?? ''}
              onChange={(e) => set('currency', e.target.value || null)}
              className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
            >
              <option value="">{t('filters.anyCurrency')}</option>
              {Object.keys(t('form.currencies', { returnObjects: true }) as Record<string, string>).map((code) => (
                <option key={code} value={code}>
                  {(t('form.currencies', { returnObjects: true }) as Record<string, string>)[code]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Язык мероприятия */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.language')}</label>
        <select
          value={filters.language ?? ''}
          onChange={(e) => set('language', e.target.value || null)}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        >
          <option value="">{t('filters.anyLanguage')}</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {lang === 'ru' ? l.name_ru : l.name_en}
            </option>
          ))}
        </select>
      </div>

      {/* Ключевые слова */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.query')}</label>
        <input
          value={filters.query ?? ''}
          onChange={(e) => set('query', e.target.value || undefined)}
          placeholder={t('filters.queryPlaceholder')}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        />
      </div>

      {onApply && (
        <button
          onClick={onApply}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          {t('filters.apply')}
        </button>
      )}

      <button
        onClick={() => {
          onChange(EMPTY_FILTERS);
          onReset?.();
        }}
        className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm text-gray-600 hover:bg-gray-50"
      >
        {t('filters.reset')}
      </button>
    </div>
  );
}
