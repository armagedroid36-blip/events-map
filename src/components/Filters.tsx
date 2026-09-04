// Панель фильтров: категория, период, город, цена, валюта, язык, ключевые слова.
// Фильтры применяются МГНОВЕННО (onChange пишет в общий filters родителя),
// кнопки «Найти» нет. Город — автокомплит с выпадающим списком (не datalist).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Category, Filters } from '../lib/types';
import { LANGUAGES } from '../lib/languages';
import { COUNTRY_NAMES, detectCountry } from '../lib/countries';
import { cityMatches, ruToEn } from '../lib/cities';
import { todayIso } from '../lib/dates';

interface Props {
  categories: Category[];
  filters: Filters;
  onChange: (f: Filters) => void;
  /** Города из базы — для автодополнения */
  cities?: string[];
  /** Страны из базы — для фильтра (канонические коды, возможно 'other') */
  countries?: string[];
  /** Сколько событий найдено после фильтров (для строки «Найдено: N») */
  count?: number;
  /** Кнопка «Показать N событий» (мобильная модалка): закрывает её по нажатию */
  onShowResults?: () => void;
  /** Подтверждённый город (клик по варианту автокомплита / Enter): геопереход карты */
  onCityCommit?: (city: string) => void;
  /** Сбросить и применённые фильтры (карту к городу при этом не двигаем) */
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

function formatDateLabel(iso: string, lang: 'ru' | 'en'): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

/** Чип активного фильтра: подпись + крестик (снимает только этот фильтр) */
function Chip({ label, onClear, closeLabel }: { label: string; onClear: () => void; closeLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-300 bg-gray-100 py-0.5 pl-2 pr-1 text-xs text-gray-700">
      <span className="truncate">{label}</span>
      <button
        onClick={onClear}
        aria-label={closeLabel}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
      >
        ✕
      </button>
    </span>
  );
}

/** Автокомплит города: input + выпадающий список поверх панели (portal в body).
 *  Ввод фильтрует список по RU/EN написаниям (cityMatches) и сразу пишет city
 *  в фильтр (onInput); геопереход карты (onPick) — только по выбору варианта
 *  из списка или Enter, не на каждый символ. */
function CityAutocomplete({
  value,
  options,
  onInput,
  onPick,
  ariaLabel,
  placeholder,
  emptyLabel,
}: {
  value: string;
  options: string[];
  /** Ввод текста: меняет значение фильтра (мгновенная фильтрация) */
  onInput: (v: string) => void;
  /** Выбор варианта из списка или Enter: город подтверждён (геопереход карты) */
  onPick: (city: string) => void;
  ariaLabel: string;
  placeholder: string;
  emptyLabel: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useRef(`city-list-${Math.random().toString(36).slice(2, 8)}`).current;

  const q = value.trim();
  const filtered = useMemo(
    () => (q ? options.filter((c) => cityMatches(c, q)) : options),
    [options, q],
  );
  const idx = Math.min(hl, Math.max(filtered.length - 1, 0));

  // Позиция списка: под полем; если не влезает вниз — над полем.
  // Пересчитывается на scroll/resize (клавиатура на мобильном, скролл
  // панели) вместо закрытия — иначе список гаснет в момент фокуса, когда
  // браузер подскролливает поле к клавиатуре. Если поле ушло за экран —
  // список прячем (pos = null).
  const updatePos = () => {
    const input = rootRef.current?.querySelector('input');
    if (!input) return;
    const rect = input.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setPos(null);
      return;
    }
    const estH = filtered.length === 0 ? 44 : Math.min(filtered.length * 34 + 10, 216);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estH + 8 && rect.top > estH + 8;
    setPos({
      top: openUp ? Math.max(8, rect.top - estH) : rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    });
  };
  const updatePosRef = useRef(updatePos);
  updatePosRef.current = updatePos;

  useEffect(() => {
    if (!open) return;
    updatePosRef.current();
  }, [open, filtered.length]);

  // Закрытие: клик/тап вне контрола и списка, Esc. Scroll/resize НЕ закрывают
  // (см. updatePos) — они пересчитывают позицию списка.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = () => updatePosRef.current();
    const onResize = () => updatePosRef.current();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const pick = (city: string) => {
    setOpen(false);
    setHl(0);
    onPick(city);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (filtered.length > 0 && open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHl((h) => (h + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHl((h) => (h - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        pick(filtered[idx]);
        return;
      }
    } else if (e.key === 'Enter') {
      // Свободный текст: явное подтверждение (Enter) — тоже «выбор города»
      const v = value.trim();
      if (v) pick(v);
      else e.preventDefault();
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <input
        value={value}
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setHl(0);
        }}
        onChange={(e) => {
          setHl(0);
          onInput(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
      />
      {open && pos && filtered.length > 0
        ? createPortal(
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label={t('filters.citySuggestions')}
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              className="fixed z-[1400] max-h-56 overflow-y-auto rounded-lg border border-gray-300 bg-white py-1 shadow-xl thin-scroll"
            >
              {filtered.map((c, i) => {
                const en = ruToEn(c);
                const label = en && en !== c ? `${c} (${en})` : c;
                return (
                  <li
                    key={c}
                    role="option"
                    aria-selected={i === idx}
                    onMouseEnter={() => setHl(i)}
                    onMouseDown={(e) => {
                      // mousedown с preventDefault: инпут не теряет фокус, blur не закрывает список
                      e.preventDefault();
                      pick(c);
                    }}
                    className={`cursor-pointer truncate px-3 py-1.5 text-sm text-gray-800 ${
                      i === idx ? 'bg-gray-100' : ''
                    }`}
                  >
                    {label}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : open && filtered.length === 0 && q
          ? createPortal(
              <ul
                id={listId}
                ref={listRef}
                role="listbox"
                aria-label={emptyLabel}
                style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width ?? 0 }}
                className="fixed z-[1400] rounded-lg border border-gray-300 bg-white py-2 text-center text-xs text-gray-500 shadow-xl"
              >
                <li role="option" aria-disabled="true" className="px-3 py-1">
                  {emptyLabel}
                </li>
              </ul>,
              document.body,
            )
          : null}
    </div>
  );
}

export default function FiltersPanel({
  categories,
  filters,
  onChange,
  cities = [],
  countries = [],
  count,
  onShowResults,
  onCityCommit,
  onReset,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  // Страны только из актуальных событий (проп countries), без повторов,
  // с названием на языке интерфейса; «Другие» — события, страну которых
  // не определили (присутствует, только если такие события есть в данных).
  const countryList = [...new Set(countries)].sort((a, b) => {
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    const na = COUNTRY_NAMES[a]?.[lang] ?? a;
    const nb = COUNTRY_NAMES[b]?.[lang] ?? b;
    return na.localeCompare(nb);
  });

  // Города только выбранной страны (при «Любая страна» — все города базы).
  const cityOptions = filters.country
    ? cities.filter(
        (c) =>
          (filters.country === 'other' ? '' : filters.country) === detectCountry(c),
      )
    : cities;

  // Текстовый запрос — живой, с debounce 300 мс (поле локальное, в фильтр
  // пишется с задержкой, чтобы не пересчитывать список на каждый символ)
  const [queryDraft, setQueryDraft] = useState(filters.query ?? '');
  const qTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setQueryDraft(filters.query ?? '');
  }, [filters.query]);
  useEffect(() => () => window.clearTimeout(qTimer.current), []);
  const onQueryChange = (v: string) => {
    setQueryDraft(v);
    window.clearTimeout(qTimer.current);
    qTimer.current = window.setTimeout(() => {
      onChange({ ...filters, query: v.trim() ? v : undefined });
    }, 300);
  };

  // Чипы активных фильтров: подпись + снятие по одному
  const chips = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.categoryId) {
      const c = categories.find((x) => x.id === filters.categoryId);
      if (c) {
        out.push({
          key: 'categoryId',
          label: `${c.emoji} ${lang === 'ru' ? c.name_ru : c.name_en}`,
          clear: () => set('categoryId', null),
        });
      }
    }
    if (filters.date) {
      const label =
        filters.date === 'today'
          ? t('filters.today')
          : filters.date === 'tomorrow'
            ? t('filters.tomorrow')
            : formatDateLabel(filters.date, lang);
      out.push({ key: 'date', label, clear: () => set('date', undefined) });
    }
    if (filters.country) {
      const code = filters.country;
      out.push({
        key: 'country',
        label: code === 'other' ? t('filters.other') : (COUNTRY_NAMES[code]?.[lang] ?? code),
        clear: () => set('country', null),
      });
    }
    if (filters.city?.trim()) {
      out.push({ key: 'city', label: filters.city.trim(), clear: () => set('city', undefined) });
    }
    if (filters.price && filters.price !== 'any') {
      const label =
        filters.price === 'free'
          ? t('filters.freeOnly')
          : filters.price === 'paid'
            ? t('filters.paidOnly')
            : t('filters.donationOnly');
      out.push({ key: 'price', label, clear: () => set('price', 'any') });
    }
    if (filters.priceMin != null || filters.priceMax != null) {
      const min = filters.priceMin;
      const max = filters.priceMax;
      const label =
        min != null && max != null
          ? `${min}–${max} $`
          : min != null
            ? `≥ ${min} $`
            : `≤ ${max} $`;
      out.push({
        key: 'range',
        label,
        clear: () => {
          set('priceMin', undefined);
          set('priceMax', undefined);
        },
      });
    }
    if (filters.currency) {
      const cur =
        (t('form.currencies', { returnObjects: true }) as Record<string, string>)[
          filters.currency
        ] ?? filters.currency.toUpperCase();
      out.push({ key: 'currency', label: cur, clear: () => set('currency', null) });
    }
    if (filters.language) {
      const l = LANGUAGES.find((x) => x.code === filters.language);
      out.push({
        key: 'language',
        label: lang === 'ru' ? (l?.name_ru ?? filters.language) : (l?.name_en ?? filters.language),
        clear: () => set('language', null),
      });
    }
    if (filters.query?.trim()) {
      const qText = filters.query.trim();
      out.push({
        key: 'query',
        label: qText.length > 18 ? `${qText.slice(0, 18)}…` : qText,
        clear: () => {
          set('query', undefined);
          setQueryDraft('');
        },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, categories, lang, t]);

  return (
    <div className="space-y-3 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 pr-8">
        <h2 className="text-sm font-semibold text-gray-900">{t('filters.title')}</h2>
        {count != null && (
          <span className="text-xs text-gray-500">{t('filters.found', { count })}</span>
        )}
      </div>

      {/* Активные фильтры — чипы, снимаются по одному */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((ch) => (
            <Chip key={ch.key} label={ch.label} onClear={ch.clear} closeLabel={t('common.close')} />
          ))}
        </div>
      )}

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
              {code === 'other' ? t('filters.other') : (COUNTRY_NAMES[code]?.[lang] ?? code)}
            </option>
          ))}
        </select>
      </div>

      {/* Город (автокомплит с выпадающим списком) */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.city')}</label>
        <CityAutocomplete
          value={filters.city ?? ''}
          options={cityOptions}
          ariaLabel={t('filters.city')}
          placeholder={t('filters.cityPlaceholder')}
          emptyLabel={t('filters.cityEmpty')}
          onInput={(v) => set('city', v || undefined)}
          onPick={(city) => {
            const c = city.trim();
            set('city', c || undefined);
            if (c) onCityCommit?.(c);
          }}
        />
      </div>

      {/* Цена */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.price')}</label>
        <select
          value={filters.price}
          onChange={(e) => set('price', e.target.value as 'any' | 'free' | 'paid' | 'donation')}
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

      {/* Ключевые слова — живой поиск (debounce внутри) */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">{t('filters.query')}</label>
        <input
          value={queryDraft}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('filters.queryPlaceholder')}
          className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm"
        />
      </div>

      {onShowResults && (
        <button
          onClick={onShowResults}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          {t('filters.showResults', { count: count ?? 0 })}
        </button>
      )}

      <button
        onClick={() => {
          // Таймер debounce текстового запроса гасим, чтобы он не сработал
          // после сброса и не вернул query поверх очищенных фильтров.
          window.clearTimeout(qTimer.current);
          onChange(EMPTY_FILTERS);
          setQueryDraft('');
          onReset?.();
        }}
        className="w-full rounded-md border border-gray-400 px-2 py-1.5 hover:border-gray-500 text-sm text-gray-600 hover:bg-gray-50"
      >
        {t('filters.reset')}
      </button>
    </div>
  );
}
