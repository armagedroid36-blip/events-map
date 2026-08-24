// Избранное (#/favorites): сохранённые события с фильтрами.
// Сердечко на карточке/в списке добавляет и убирает события; здесь —
// список с теми же фильтрами, что на главной (категория, город, дата…).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import FiltersPanel from '../components/Filters';
import EventsList from '../components/EventsList';
import EventCard from '../components/EventCard';
import { getApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DEFAULT_FILTERS, eventMatchesFilters } from '../lib/eventFilters';
import { eventCountry } from '../lib/countries';
import type { Category, EventItem, Filters } from '../lib/types';

export default function FavoritesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // Черновик фильтров в панели; применяется по кнопке «Найти»
  const [draft, setDraft] = useState<Filters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<EventItem | null>(null);

  async function load() {
    const [favs, cats] = await Promise.all([
      getApi().listFavorites(),
      getApi().getCategories(),
    ]);
    setEvents(favs);
    setCategories(cats);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  // Список сохранённых событий после фильтров (та же логика, что на главной)
  const visible = useMemo(
    () => events.filter((ev) => eventMatchesFilters(ev, filters)),
    [events, filters],
  );

  // Города и страны из сохранённых событий — для автодополнения фильтров
  const allCities = useMemo(
    () => [...new Set(events.map((e) => e.city).filter(Boolean))].sort(),
    [events],
  );
  const allCountries = useMemo(
    () => [...new Set(events.map((e) => eventCountry(e) || 'other'))].sort(),
    [events],
  );

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">
          {t('favorites.accessDenied')}
        </div>
      </div>
    );
  }

  // Все показанные события — уже в избранном; сердечко убирает из списка
  const favoriteIds = events.map((e) => e.id);

  async function toggleFavorite(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (selected?.id === id) setSelected(null);
    try {
      await getApi().removeFavorite(id);
    } catch {
      // Ошибка — перезагружаем список, чтобы состояние совпало с базой
      load();
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-3xl flex-1 p-4">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">{t('favorites.title')}</h1>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">{t('favorites.empty')}</p>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-gray-200 bg-white/70">
              <FiltersPanel
                categories={categories}
                filters={draft}
                onChange={setDraft}
                cities={allCities}
                countries={allCountries}
                onApply={() => setFilters(draft)}
                onReset={() => {
                  setDraft(DEFAULT_FILTERS);
                  setFilters(DEFAULT_FILTERS);
                }}
              />
            </div>

            <EventsList
              events={visible}
              categories={categories}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
            />

            {selected && (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex justify-end pb-1">
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  >
                    ✕ {t('common.close')}
                  </button>
                </div>
                <EventCard
                  event={selected}
                  categories={categories}
                  onClose={() => setSelected(null)}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
