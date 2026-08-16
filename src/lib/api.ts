// Слой данных сайта.
// Единый интерфейс DataApi — публичная часть и админка работают с ним,
// не зная, откуда берутся данные (демо или Supabase).
// Это позволяет подключить реальную базу и будущие модули автоматизации
// (фиды, парсинг) без переделки остального кода.
import type { Category, EventItem, Application, ApplicationDraft, ImportRow } from './types';
import { config } from '../config';
import { DemoApi } from './demo';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
 * Реализация на Supabase.
 * Публичная часть читает напрямую из таблиц (защита RLS),
 * админские операции идут через SQL-функции (модерация, правка).
 */
class SupabaseApi implements DataApi {
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  // --- Публичная часть ---

  async listEvents(): Promise<EventItem[]> {
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .eq('status', 'active')
      .order('start_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as EventItem[];
  }

  async listAllEvents(): Promise<EventItem[]> {
    const { data, error } = await this.db.rpc('list_all_events');
    if (error) throw error;
    return (data ?? []) as EventItem[];
  }

  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.db.from('categories').select('*').order('id');
    if (error) throw error;
    return (data ?? []) as Category[];
  }

  async submitApplication(draft: ApplicationDraft): Promise<void> {
    const { error } = await this.db.from('applications').insert(draft as never);
    if (error) throw error;
  }

  // --- Админка ---

  async adminLogin(_email: string, password: string): Promise<boolean> {
    // MVP: пароль хранится в .env. Позже — полноценный вход через Supabase Auth.
    return config.adminPassword !== '' && password === config.adminPassword;
  }

  async listApplications(): Promise<Application[]> {
    const { data, error } = await this.db.rpc('list_all_applications');
    if (error) throw error;
    return (data ?? []) as Application[];
  }

  async approveApplication(id: string): Promise<void> {
    const { error } = await this.db.rpc('approve_application', { app_id: id });
    if (error) throw error;
  }

  async rejectApplication(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('reject_application', { app_id: id, reason });
    if (error) throw error;
  }

  async createEvent(data: Partial<EventItem>): Promise<EventItem> {
    const { data: ev, error } = await this.db.rpc('create_event', { data });
    if (error) throw error;
    return ev as EventItem;
  }

  async updateEvent(id: string, data: Partial<EventItem>): Promise<void> {
    const { error } = await this.db.rpc('update_event', { ev_id: id, data });
    if (error) throw error;
  }

  async deleteEvent(id: string): Promise<void> {
    const { error } = await this.db.rpc('delete_event', { ev_id: id });
    if (error) throw error;
  }

  async createCategory(data: Omit<Category, 'id'>): Promise<void> {
    const { error } = await this.db.rpc('create_category', { data });
    if (error) throw error;
  }

  async updateCategory(id: string, data: Partial<Category>): Promise<void> {
    const { error } = await this.db.rpc('update_category', { cat_id: id, data });
    if (error) throw error;
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.db.rpc('delete_category', { cat_id: id });
    if (error) throw error;
  }

  async importEvents(rows: ImportRow[]): Promise<number> {
    const { data, error } = await this.db.rpc('import_events', { rows });
    if (error) throw error;
    return (data as number) ?? 0;
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
