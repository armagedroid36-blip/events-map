// Панель фильтров: категория, период, город, цена, валюта, язык, ключевые слова.
import { useTranslation } from 'react-i18next';
import type { Category, Filters } from '../lib/types';
import { LANGUAGES } from '../lib/languages';
import { KNOWN_COUNTRIES } from '../lib/countries';

interface Props {
  categories: Category[];
  filters: Filters;
  onChange: (f: Filters) => void;
  /** Города из базы — для автодополнения */
  cities?: string[];
  /** Страны из базы — для фильтра */
  countries?: string[];
}

export default function FiltersPanel({ categories, filters, onChange, cities = [], countries = [] }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3 rounded-lg p-3">
      <h2 className="text-sm font-semibold text-gray-900">{t('filters.title')}</h2>

      {/* Категория */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.category')}</label>
        <select
          value={filters.categoryId ?? ''}
          onChange={(e) => set('categoryId', e.target.value || null)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">{t('filters.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {lang === 'ru' ? c.name_ru : c.name_en}
            </option>
          ))}
        </select>
      </div>

      {/* Период */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.period')}</label>
        <div className="flex gap-2">
          <button
            onClick={() => set('period', 'all')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
              filters.period === 'all'
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('filters.allPeriod')}
          </button>
          <button
            onClick={() => set('period', 'upcoming')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
              filters.period === 'upcoming'
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('filters.upcoming')}
          </button>
        </div>
      </div>

      {/* Город (с автодополнением из базы) */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.city')}</label>
        <input
          list="city-options"
          value={filters.city ?? ''}
          onChange={(e) => set('city', e.target.value || undefined)}
          placeholder={t('filters.cityPlaceholder')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <datalist id="city-options">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {/* Страна */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.country')}</label>
        <select
          value={filters.country ?? ''}
          onChange={(e) => set('country', e.target.value || null)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">{t('filters.anyCountry')}</option>
          {[...new Set([...countries, ...KNOWN_COUNTRIES])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Цена */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.price')}</label>
        <select
          value={filters.price}
          onChange={(e) => set('price', e.target.value as 'any' | 'free' | 'paid')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="any">{t('filters.anyPrice')}</option>
          <option value="free">{t('filters.freeOnly')}</option>
          <option value="paid">{t('filters.paidOnly')}</option>
        </select>
        {/* Диапазон цены (применяется к платным) */}
        {filters.price !== 'free' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-gray-400">{t('filters.priceFrom')}</label>
              <input
                type="number"
                min="0"
                value={filters.priceMin ?? ''}
                onChange={(e) => set('priceMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-gray-400">{t('filters.priceTo')}</label>
              <input
                type="number"
                min="0"
                value={filters.priceMax ?? ''}
                onChange={(e) => set('priceMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
        {/* Валюта */}
        {filters.price !== 'free' && (
          <div className="mt-2">
            <label className="mb-0.5 block text-[11px] text-gray-400">{t('filters.currency')}</label>
            <select
              value={filters.currency ?? ''}
              onChange={(e) => set('currency', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
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
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
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
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      <button
        onClick={() =>
          onChange({
            categoryId: null,
            period: 'upcoming',
            price: 'any',
            priceMin: undefined,
            priceMax: undefined,
            currency: null,
            language: null,
            country: null,
            city: undefined,
            query: undefined,
          })
        }
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        {t('filters.reset')}
      </button>
    </div>
  );
}
