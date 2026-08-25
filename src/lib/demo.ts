// Демо-режим: сайт работает БЕЗ базы данных.
// Данные хранятся в localStorage браузера. Нужен, чтобы проверить
// внешний вид и поведение сайта до подключения Supabase.
import type { Category, EventItem, Application, ApplicationDraft, ImportRow } from './types';

/** Относительные даты: событие всегда в будущем, демо «живое» */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Примеры событий для демо (Бали и Юго-Восточная Азия) */
const DEMO_EVENTS: EventItem[] = [
  {
    id: 'demo-1',
    title: 'Ubud Yoga & Sound Healing Retreat',
    title_ru: 'Ретрит йоги и звукотерапии в Убуде',
    description: 'A 3-day immersive retreat with morning vinyasa, gong baths and meditation in the rice fields of Ubud.',
    description_ru: 'Трёхдневный погружающий ретрит: утренняя виньяса, гонг-медитации и практики на рисовых террасах Убуда.',
    source_lang: 'en',
    start_date: inDays(7),
    end_date: inDays(9),
    city: 'Ubud, Bali',
    address: 'Jl. Raya Sanggingan, Ubud',
    lat: -8.5069,
    lng: 115.2625,
    category_id: 'lecture',
    website: 'https://example.com/yoga-retreat',
    contact: 'hello@example.com',
    photos: [],
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    title: 'Bali Tech Summit 2026',
    title_ru: 'Балийский технологический саммит 2026',
    description: 'Two days of talks on AI, fintech and startups, with networking at sunset on the beach in Canggu.',
    description_ru: 'Два дня докладов об ИИ, финтехе и стартапах, нетворкинг на закате на пляже в Чангу.',
    source_lang: 'en',
    start_date: inDays(14),
    end_date: inDays(15),
    city: 'Canggu, Bali',
    address: 'Jl. Pantai Batu Bolong, Canggu',
    lat: -8.6446,
    lng: 115.1353,
    category_id: 'conference',
    website: 'https://example.com/bali-tech',
    contact: 'info@example.com',
    photos: [],
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    title: 'Singapore Art Week Opening',
    title_ru: 'Открытие недели искусства в Сингапуре',
    description: 'Opening night of Singapore Art Week with contemporary art exhibitions, performances and gallery tours.',
    description_ru: 'Открытие недели искусства в Сингапуре: выставки современного искусства, перформансы и экскурсии по галереям.',
    source_lang: 'en',
    start_date: inDays(21),
    end_date: inDays(21),
    city: 'Singapore',
    address: 'Gillman Barracks, Singapore',
    lat: 1.282,
    lng: 103.807,
    category_id: 'exhibition',
    website: 'https://example.com/art-week',
    contact: 'art@example.com',
    photos: [],
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-4',
    title: 'Bangkok Street Food Festival',
    title_ru: 'Фестиваль уличной еды в Бангкоке',
    description: 'Over 80 food stalls, live cooking shows and traditional Thai music along the Chao Phraya river.',
    description_ru: 'Более 80 лавок с едой, кулинарные шоу и тайская музыка на берегу реки Чао Прайя.',
    source_lang: 'en',
    start_date: inDays(30),
    end_date: inDays(32),
    city: 'Bangkok',
    address: 'Chao Phraya Riverfront, Bangkok',
    lat: 13.736,
    lng: 100.5,
    category_id: 'food',
    website: 'https://example.com/bkk-food',
    contact: 'food@example.com',
    photos: [],
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-5',
    title: 'Full Moon Party at Canggu Beach',
    title_ru: 'Вечеринка полнолуния на пляже Чангу',
    description: 'Beach party with DJs from around the world, fire shows and dancing until sunrise.',
    description_ru: 'Вечеринка на пляже: диджеи со всего мира, файер-шоу и танцы до рассвета.',
    source_lang: 'en',
    start_date: inDays(45),
    city: 'Canggu, Bali',
    lat: -8.6519,
    lng: 115.1333,
    category_id: 'party',
    website: 'https://example.com/full-moon',
    contact: 'party@example.com',
    photos: [],
    status: 'active',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-6',
    title: 'Ho Chi Minh City Marathon 2026',
    title_ru: 'Марафон в Хошимине 2026',
    description: 'Full and half marathon through the streets of Saigon, starting at the city opera house.',
    description_ru: 'Полный и половинный марафон по улицам Сайгона, старт у городского оперного театра.',
    source_lang: 'en',
    start_date: inDays(60),
    city: 'Ho Chi Minh City',
    address: 'Nguyen Hue Boulevard, HCMC',
    lat: 10.776,
    lng: 106.701,
    category_id: 'sport',
    website: 'https://example.com/hcm-marathon',
    contact: 'run@example.com',
    photos: [],
    status: 'active',
    created_at: new Date().toISOString(),
  },
];

/** Ключи localStorage для демо-режима */
const LS_EVENTS = 'events-map-demo-events';
const LS_APPS = 'events-map-demo-applications';
const LS_CATS = 'events-map-demo-categories';
const LS_FAVS = 'events-map-demo-favorites';

/** Чтение/запись JSON в localStorage с запасным значением */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Реализация API в демо-режиме (localStorage). */
export class DemoApi {
  // --- Публичная часть ---

  async listEvents(): Promise<EventItem[]> {
    return load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).filter((e) => e.status === 'active');
  }

  async listAllEvents(): Promise<EventItem[]> {
    return load<EventItem[]>(LS_EVENTS, DEMO_EVENTS);
  }

  async listModerationEvents(): Promise<EventItem[]> {
    return load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).filter((e) => e.status === 'moderation');
  }

  async getCategories(): Promise<Category[]> {
    return load<Category[]>(LS_CATS, DEMO_CATEGORIES);
  }

  async submitApplication(draft: ApplicationDraft): Promise<void> {
    const apps = load<Application[]>(LS_APPS, []);
    apps.push({
      ...draft,
      id: `app-${Date.now()}`,
      status: 'new',
      created_at: new Date().toISOString(),
    });
    save(LS_APPS, apps);
  }

  // --- Админка (в демо-режиме доступна без входа) ---

  async adminLogin(_email: string, _password: string): Promise<boolean> {
    return true; // демо: вход пропускается
  }

  async listApplications(): Promise<Application[]> {
    return load<Application[]>(LS_APPS, []);
  }

  async approveApplication(id: string): Promise<void> {
    const apps = load<Application[]>(LS_APPS, []);
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    app.status = 'approved';
    save(LS_APPS, apps);
    // Принятая заявка становится событием
    const events = load<EventItem[]>(LS_EVENTS, DEMO_EVENTS);
    events.push({
      id: `ev-${Date.now()}`,
      title: app.title,
      description: app.description,
      source_lang: app.source_lang,
      start_date: app.start_date,
      end_date: app.end_date,
      city: app.city,
      address: app.address,
      lat: app.lat ?? 0,
      lng: app.lng ?? 0,
      category_id: app.category_id,
      website: app.website,
      contact: app.contact,
      photos: app.photos,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    save(LS_EVENTS, events);
  }

  async rejectApplication(id: string, reason: string): Promise<void> {
    const apps = load<Application[]>(LS_APPS, []);
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    app.status = 'rejected';
    app.reject_reason = reason;
    save(LS_APPS, apps);
  }

  async deleteModerationEvents(): Promise<number> {
    // Демо: события на модерации не хранятся
    return 0;
  }

  async createEvent(data: Partial<EventItem>): Promise<EventItem> {
    const events = load<EventItem[]>(LS_EVENTS, DEMO_EVENTS);
    const ev: EventItem = {
      id: `ev-${Date.now()}`,
      title: data.title ?? 'Без названия',
      description: data.description ?? '',
      source_lang: data.source_lang ?? 'ru',
      start_date: data.start_date ?? inDays(1),
      end_date: data.end_date,
      city: data.city ?? '',
      address: data.address,
      lat: data.lat ?? 0,
      lng: data.lng ?? 0,
      category_id: data.category_id ?? '',
      website: data.website,
      contact: data.contact,
      photos: data.photos ?? [],
      status: data.status ?? 'active',
      created_at: new Date().toISOString(),
    };
    events.push(ev);
    save(LS_EVENTS, events);
    return ev;
  }

  async updateEvent(id: string, data: Partial<EventItem>): Promise<void> {
    const events = load<EventItem[]>(LS_EVENTS, DEMO_EVENTS);
    const idx = events.findIndex((e) => e.id === id);
    if (idx >= 0) {
      events[idx] = { ...events[idx], ...data, id };
      save(LS_EVENTS, events);
    }
  }

  async deleteEvent(id: string): Promise<void> {
    save(
      LS_EVENTS,
      load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).filter((e) => e.id !== id),
    );
  }

  async createCategory(data: Omit<Category, 'id'>): Promise<void> {
    const cats = load<Category[]>(LS_CATS, DEMO_CATEGORIES);
    cats.push({ ...data, id: `cat-${Date.now()}` });
    save(LS_CATS, cats);
  }

  async updateCategory(id: string, data: Partial<Category>): Promise<void> {
    const cats = load<Category[]>(LS_CATS, DEMO_CATEGORIES);
    const idx = cats.findIndex((c) => c.id === id);
    if (idx >= 0) {
      cats[idx] = { ...cats[idx], ...data, id };
      save(LS_CATS, cats);
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const cats = load<Category[]>(LS_CATS, DEMO_CATEGORIES);
    const used = load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).some(
      (e) => e.category_id === id,
    );
    if (used) throw new Error('CATEGORY_IN_USE');
    save(LS_CATS, cats.filter((c) => c.id !== id));
  }

  async importEvents(rows: ImportRow[]): Promise<number> {
    const events = load<EventItem[]>(LS_EVENTS, DEMO_EVENTS);
    let count = 0;
    for (const row of rows) {
      // Определяем категорию по имени (если не задан id)
      let category_id = row.category_id ?? '';
      if (!category_id) {
        const cats = load<Category[]>(LS_CATS, DEMO_CATEGORIES);
        category_id = cats[0]?.id ?? '';
      }
      events.push({
        id: `ev-${Date.now()}-${count}`,
        title: row.title,
        description: row.description ?? '',
        source_lang: 'ru',
        start_date: row.start_date,
        end_date: row.end_date,
        city: row.city,
        address: row.address,
        lat: row.lat ?? 0,
        lng: row.lng ?? 0,
        category_id,
        website: row.website,
        status: 'active',
        created_at: new Date().toISOString(),
      });
      count++;
    }
    save(LS_EVENTS, events);
    return count;
  }

  // --- Авторизация (демо: вход без проверок) ---

  async signUp(
    _email: string,
    _password: string,
    _role: string,
    _contacts: Record<string, string>,
  ): Promise<void> {}

  async signIn(_email: string, _password: string) {
    return { id: 'demo', email: _email, role: 'admin' };
  }

  async confirmSignup(_email: string, _code: string, _role: string, _contacts: Record<string, string>) {
    return { id: 'demo', email: _email, role: _role };
  }

  async signOut(): Promise<void> {}

  async deleteAccount(): Promise<void> {}

  async getCurrentUser() {
    return { id: 'demo', email: 'demo@demo', role: 'admin' };
  }

  async uploadPhoto(file: File): Promise<string> {
    return URL.createObjectURL(file);
  }

  async getMyProfile() {
    return null;
  }

  async updateProfile(): Promise<void> {}

  async resetPassword(): Promise<void> {}

  async updatePassword(): Promise<void> {}

  async listMyEvents(): Promise<EventItem[]> {
    return load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).filter((e) => e.status !== 'archived');
  }

  async repeatEvent(id: string, start_date: string, end_date?: string): Promise<EventItem> {
    const src = load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).find((e) => e.id === id);
    if (!src) throw new Error('Событие не найдено');
    return this.createEvent({ ...src, start_date, end_date, status: 'moderation' });
  }

  async createOrgEvent(data: Partial<EventItem>): Promise<EventItem> {
    return this.createEvent({ ...data, status: 'moderation' });
  }

  async approveEvent(id: string): Promise<void> {
    this.updateEvent(id, { status: 'active' });
  }

  async rejectEvent(id: string, reason: string): Promise<void> {
    this.updateEvent(id, { status: 'needs_changes', reject_reason: reason });
  }

  async incrementCounter(_name: string): Promise<void> {}

  async getStats(): Promise<Record<string, number>> {
    return { visits: 0, card_views: 0 };
  }

  async listArchived(): Promise<EventItem[]> {
    return load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).filter((e) => e.status === 'archived');
  }

  async addHistory(_eventId: string): Promise<void> {}

  async listHistory() {
    return [] as { id: string; event_id: string; viewed_at: string }[];
  }

  async clearHistory(): Promise<void> {}

  async removeHistory(_id: string): Promise<void> {}

  // --- Уведомления организатора (демо: бейдж не считается) ---

  async getMyEventsBadge(): Promise<number> {
    return 0;
  }

  async markMyEventsSeen(): Promise<void> {}

  async markModerationSeen(): Promise<void> {}

  async getNotifyEmail(): Promise<string | null> {
    return null;
  }

  async setNotifyEmail(_email: string): Promise<void> {}

  // --- Избранное (демо: localStorage) ---

  async listFavorites(): Promise<EventItem[]> {
    const ids = load<string[]>(LS_FAVS, []);
    return load<EventItem[]>(LS_EVENTS, DEMO_EVENTS).filter(
      (e) => e.status === 'active' && ids.includes(e.id),
    );
  }

  async getFavoritesIds(): Promise<string[]> {
    return load<string[]>(LS_FAVS, []);
  }

  async addFavorite(eventId: string): Promise<void> {
    const ids = load<string[]>(LS_FAVS, []);
    if (!ids.includes(eventId)) ids.push(eventId);
    save(LS_FAVS, ids);
  }

  async removeFavorite(eventId: string): Promise<void> {
    save(
      LS_FAVS,
      load<string[]>(LS_FAVS, []).filter((id) => id !== eventId),
    );
  }
}

/** Категории по умолчанию (совпадают с config.defaultCategories) */
const DEMO_CATEGORIES: Category[] = [
  { id: 'conference', name_ru: 'Конференции', name_en: 'Conferences', emoji: '💼' },
  { id: 'exhibition', name_ru: 'Выставки', name_en: 'Exhibitions', emoji: '🖼️' },
  { id: 'concert', name_ru: 'Концерты', name_en: 'Concerts', emoji: '🎤' },
  { id: 'sport', name_ru: 'Спорт', name_en: 'Sports', emoji: '🏃' },
  { id: 'lecture', name_ru: 'Лекции', name_en: 'Lectures', emoji: '📚' },
  { id: 'party', name_ru: 'Вечеринки', name_en: 'Parties', emoji: '🪩' },
  { id: 'festival', name_ru: 'Фестивали', name_en: 'Festivals', emoji: '🎉' },
  { id: 'food', name_ru: 'Еда и напитки', name_en: 'Food & Drink', emoji: '🍜' },
];
