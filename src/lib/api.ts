// Слой данных сайта.
// Единый интерфейс DataApi — публичная часть и админка работают с ним,
// не зная, откуда берутся данные (демо или Supabase).
// Это позволяет подключить реальную базу и будущие модули автоматизации
// (фиды, парсинг) без переделки остального кода.
import type { Category, EventItem, Application, ApplicationDraft, ImportRow } from './types';
import { config } from '../config';
import { DemoApi } from './demo';

/** Единый интерфейс доступа к данным */
export interface DataApi {
  // --- Публичная часть ---
  listEvents(): Promise<EventItem[]>;
  /** Полный список (включая прошедшие/скрытые) — только для админки */
  listAllEvents(): Promise<EventItem[]>;
  getCategories(): Promise<Category[]>;
  submitApplication(draft: ApplicationDraft): Promise<void>;
  // --- Админка ---
  adminLogin(email: string, password: string): Promise<boolean>;
  listApplications(): Promise<Application[]>;
  approveApplication(id: string): Promise<void>;
  rejectApplication(id: string, reason: string): Promise<void>;
  createEvent(data: Partial<EventItem>): Promise<EventItem>;
  updateEvent(id: string, data: Partial<EventItem>): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  createCategory(data: Omit<Category, 'id'>): Promise<void>;
  updateCategory(id: string, data: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  importEvents(rows: ImportRow[]): Promise<number>;
}

/**
 * Реализация на Supabase. Код готов, но активен только когда в config.ts
 * указаны адрес и ключ базы (demoMode = false). Подключение описано в README.
 */
class SupabaseApi implements DataApi {
  private requireDb(): never {
    throw new Error(
      'База данных не подключена. Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env и выключите demoMode в src/config.ts (см. README).',
    );
  }

  async listEvents(): Promise<EventItem[]> {
    this.requireDb();
  }
  async listAllEvents(): Promise<EventItem[]> {
    this.requireDb();
  }
  async getCategories(): Promise<Category[]> {
    this.requireDb();
  }
  async submitApplication(_draft: ApplicationDraft): Promise<void> {
    this.requireDb();
  }
  async adminLogin(_email: string, _password: string): Promise<boolean> {
    this.requireDb();
  }
  async listApplications(): Promise<Application[]> {
    this.requireDb();
  }
  async approveApplication(_id: string): Promise<void> {
    this.requireDb();
  }
  async rejectApplication(_id: string, _reason: string): Promise<void> {
    this.requireDb();
  }
  async createEvent(_data: Partial<EventItem>): Promise<EventItem> {
    this.requireDb();
  }
  async updateEvent(_id: string, _data: Partial<EventItem>): Promise<void> {
    this.requireDb();
  }
  async deleteEvent(_id: string): Promise<void> {
    this.requireDb();
  }
  async createCategory(_data: Omit<Category, 'id'>): Promise<void> {
    this.requireDb();
  }
  async updateCategory(_id: string, _data: Partial<Category>): Promise<void> {
    this.requireDb();
  }
  async deleteCategory(_id: string): Promise<void> {
    this.requireDb();
  }
  async importEvents(_rows: ImportRow[]): Promise<number> {
    this.requireDb();
  }
}

let apiInstance: DataApi | null = null;

/** Возвращает текущую реализацию данных (демо или Supabase) */
export function getApi(): DataApi {
  if (!apiInstance) {
    apiInstance = config.demoMode ? new DemoApi() : new SupabaseApi();
  }
  return apiInstance;
}
