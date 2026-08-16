// Панель фильтров: категория, период, город, ключевые слова.
import { useTranslation } from 'react-i18next';
import type { Category, Filters } from '../lib/types';

interface Props {
  categories: Category[];
  filters: Filters;
  onChange: (f: Filters) => void;
}

export default function FiltersPanel({ categories, filters, onChange }: Props) {
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

      {/* Город */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.city')}</label>
        <input
          value={filters.city ?? ''}
          onChange={(e) => set('city', e.target.value || undefined)}
          placeholder={t('filters.cityPlaceholder')}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
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
          onChange({ categoryId: null, period: 'upcoming', city: undefined, query: undefined })
        }
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        {t('filters.reset')}
      </button>
    </div>
  );
}
