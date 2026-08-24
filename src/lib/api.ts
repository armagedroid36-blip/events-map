// Слой данных сайта.
// Единый интерфейс DataApi — публичная часть и админка работают с ним,
// не зная, откуда берутся данные (демо или Supabase).
// Это позволяет подключить реальную базу и будущие модули автоматизации
// (фиды, парсинг) без переделки остального кода.
import type {
  Category,
  EventItem,
  Application,
  ApplicationDraft,
  ImportRow,
  Profile,
  CurrentUser,
  HistoryItem,
  UserRole,
} from './types';
import { config } from '../config';
import { DemoApi } from './demo';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Код ошибки подтверждения кода (OTP) — AuthModal показывает по нему сообщение */
export type OtpErrorCode = 'otp_expired' | 'otp_invalid' | 'otp_network' | 'otp_server';

export class OtpError extends Error {
  readonly code: OtpErrorCode;

  constructor(code: OtpErrorCode) {
    super(code);
    this.name = 'OtpError';
    this.code = code;
  }
}

/**
 * GoTrue для verifyOtp возвращает один код `otp_expired`
 * («Token has expired or is invalid») и для неверного, и для истёкшего кода —
 * разделить их по ответу Supabase нельзя, оба → otp_expired.
 * Сетевые сбои supabase-js возвращает как error (не бросает) — по тексту.
 */
function otpErrorCode(error: { code?: string; message?: string } | null): OtpErrorCode {
  const raw = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (raw.includes('expired') || raw.includes('invalid')) return 'otp_expired';
  if (raw.includes('fetch') || raw.includes('network') || raw.includes('connection')) return 'otp_network';
  return 'otp_invalid';
}

/** Единый интерфейс доступа к данным */
export interface DataApi {
  // --- Публичная часть ---
  listEvents(): Promise<EventItem[]>;
  /** Полный список (включая прошедшие/скрытые) — только для админки */
  listAllEvents(): Promise<EventItem[]>;
  /** Только события на модерации (для админа) */
  listModerationEvents(): Promise<EventItem[]>;
  getCategories(): Promise<Category[]>;
  submitApplication(draft: ApplicationDraft): Promise<void>;

  // --- Авторизация ---
  signUp(
    email: string,
    password: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string; instagram?: string },
  ): Promise<void>;
  /** Подтверждение регистрации кодом из письма + создание профиля */
  confirmSignup(
    email: string,
    code: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string; instagram?: string },
  ): Promise<CurrentUser | null>;
  signIn(email: string, password: string): Promise<CurrentUser | null>;
  signOut(): Promise<void>;
  /** Удалить свой аккаунт: профиль, историю, черновики событий и пользователя */
  deleteAccount(): Promise<void>;
  getCurrentUser(): Promise<CurrentUser | null>;
  /** Отправить письмо со ссылкой восстановления пароля (не раскрывает, есть ли email) */
  resetPassword(email: string): Promise<void>;
  /** Сменить пароль (авторизованный пользователь, recovery-сессия) */
  updatePassword(newPassword: string): Promise<void>;

  // --- Профиль и фото ---
  uploadPhoto(file: File): Promise<string>;
  /** Профиль текущего пользователя (контакты организатора) */
  getMyProfile(): Promise<Profile | null>;
  /** Сохранить контакты в профиле текущего пользователя */
  updateProfile(contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string; instagram?: string }): Promise<void>;

  // --- События организатора ---
  listMyEvents(): Promise<EventItem[]>;
  /** Создать/повторить событие от имени организатора (на модерацию) */
  createOrgEvent(data: Partial<EventItem>): Promise<EventItem>;
  /** Повторить прошедшее событие с новыми датами (копия, на модерацию) */
  repeatEvent(id: string, start_date: string, end_date?: string): Promise<EventItem>;

  // --- Модерация и архив (админ) ---
  approveEvent(id: string): Promise<void>;
  /** Отклонить событие с комментарием → статус «Требует исправлений» */
  rejectEvent(id: string, reason: string): Promise<void>;
  /** Архив: админ видит все, организатор — свои */
  listArchived(): Promise<EventItem[]>;

  // --- Статистика ---
  /** Увеличить счётчик (посещения, просмотры карточек) */
  incrementCounter(name: string): Promise<void>;
  /** Текущие значения счётчиков */
  getStats(): Promise<Record<string, number>>;

  // --- История просмотров ---
  addHistory(eventId: string): Promise<void>;
  listHistory(): Promise<HistoryItem[]>;
  clearHistory(): Promise<void>;
  removeHistory(id: string): Promise<void>;

  // --- Админка (управление) ---
  adminLogin(email: string, password: string): Promise<boolean>;
  listApplications(): Promise<Application[]>;
  approveApplication(id: string): Promise<void>;
  rejectApplication(id: string, reason: string): Promise<void>;
  /** Удалить все события на модерации (только админ) */
  deleteModerationEvents(): Promise<number>;
  createEvent(data: Partial<EventItem>): Promise<EventItem>;
  updateEvent(id: string, data: Partial<EventItem>): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  createCategory(data: Omit<Category, 'id'>): Promise<void>;
  updateCategory(id: string, data: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  importEvents(rows: ImportRow[]): Promise<number>;
}

/** Публичный URL файла в хранилище Supabase */
export function photoUrl(path: string): string {
  return `${config.supabaseUrl}/storage/v1/object/public/photos/${path}`;
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
    // Архивация прошедших событий выполняется отдельной фоновой задачей,
    // а не при каждом заходе на главную (лишняя пишущая операция)
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

  async listModerationEvents(): Promise<EventItem[]> {
    // Только события со статусом moderation (RPC security definer + is_admin)
    const { data, error } = await this.db.rpc('list_moderation_events');
    if (error) throw error;
    return (data ?? []) as EventItem[];
  }

  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.db.from('categories').select('*').order('id');
    if (error) throw error;
    return (data ?? []) as Category[];
  }

  async submitApplication(draft: ApplicationDraft): Promise<void> {
    // Таблица applications не содержит country/languages/donation — лишние поля
    // роняют INSERT (42703), и пользователь видит «Не удалось отправить заявку».
    const clean: Record<string, unknown> = { ...(draft as Record<string, unknown>) };
    delete clean.country;
    delete clean.languages;
    delete clean.donation;
    const { error } = await this.db.from('applications').insert(clean as never);
    if (error) throw error;
  }

  // --- Авторизация ---

  private async profileOf(userId: string): Promise<Profile | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return data as Profile | null;
  }

  async signUp(
    email: string,
    password: string,
    _role: UserRole,
    _contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string; instagram?: string },
  ): Promise<void> {
    const { data, error } = await this.db.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Не удалось создать аккаунт');
    // Профиль создаётся ПОСЛЕ подтверждения почты кодом (см. confirmSignup)
  }

  async signIn(email: string, password: string): Promise<CurrentUser | null> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) return null;
    const user = data.user;
    if (!user) return null;
    const profile = await this.profileOf(user.id);
    return {
      id: user.id,
      email: user.email ?? email,
      role: profile?.role ?? 'user',
    };
  }

  async confirmSignup(
    email: string,
    code: string,
    role: UserRole,
    contacts: { telegram?: string; whatsapp?: string; email?: string; phone?: string; instagram?: string },
  ): Promise<CurrentUser | null> {
    // Любые ошибки OTP пробрасываем как OtpError с кодом — AuthModal показывает
    // отдельное сообщение и не сбрасывает шаг подтверждения
    let data: { user: { id: string } | null };
    try {
      const res = await this.db.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'signup',
      });
      data = res.data;
      if (res.error || !data.user) {
        throw new OtpError(otpErrorCode(res.error));
      }
    } catch (ex) {
      if (ex instanceof OtpError) throw ex;
      // Сетевой сбой (GoTrue недоступен, нет интернета)
      throw new OtpError('otp_network');
    }
    const { error: pErr } = await this.db.rpc('create_profile', {
      uid: data.user.id,
      p_role: role,
      tg: contacts.telegram ?? '',
      wa: contacts.whatsapp ?? '',
      em: contacts.email ?? '',
      ph: contacts.phone ?? '',
      ig: contacts.instagram ?? '',
    });
    if (pErr) throw new OtpError('otp_server');
    return { id: data.user.id, email, role };
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  async deleteAccount(): Promise<void> {
    // Удаление выполняет SQL-функция (security definer): профиль, история,
    // черновики событий и сам пользователь auth.users
    const { error } = await this.db.rpc('delete_my_account');
    if (error) throw error;
    // Сессия уже недействительна — чистим её локально
    await this.db.auth.signOut().catch(() => {});
  }

  async getCurrentUser(): Promise<CurrentUser | null> {
    const { data } = await this.db.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const profile = await this.profileOf(user.id);
    return {
      id: user.id,
      email: user.email ?? '',
      role: profile?.role ?? 'user',
    };
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.db.auth.resetPasswordForEmail(email, {
      redirectTo: config.siteUrl,
    });
    if (error) throw new Error(error.message);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }

  // --- Профиль и фото ---

  async uploadPhoto(file: File): Promise<string> {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.name.split('.').pop()}`;
    const { error } = await this.db.storage.from('photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  }

  async getMyProfile(): Promise<Profile | null> {
    const me = await this.getCurrentUser();
    if (!me) return null;
    return this.profileOf(me.id);
  }

  async updateProfile(contacts: {
    telegram?: string;
    whatsapp?: string;
    email?: string;
    phone?: string;
    instagram?: string;
  }): Promise<void> {
    // Прямой UPDATE своей строки: политика «profiles own» (ALL, auth.uid() = id)
    const me = await this.getCurrentUser();
    if (!me) throw new Error('Войдите, чтобы изменить профиль');
    const { error } = await this.db
      .from('profiles')
      .update({
        contact_telegram: contacts.telegram || null,
        contact_whatsapp: contacts.whatsapp || null,
        contact_email: contacts.email || null,
        contact_phone: contacts.phone || null,
        instagram: contacts.instagram || null,
      })
      .eq('id', me.id);
    if (error) throw error;
  }

  // --- События организатора ---

  async listMyEvents(): Promise<EventItem[]> {
    const me = await this.getCurrentUser();
    if (!me) return [];
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .eq('owner_id', me.id)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EventItem[];
  }

  async createOrgEvent(data: Partial<EventItem>): Promise<EventItem> {
    const me = await this.getCurrentUser();
    if (!me) throw new Error('Войдите как организатор');
    const { data: ev, error } = await this.db
      .from('events')
      .insert({
        title: data.title ?? '',
        title_ru: data.title_ru,
        title_en: data.title_en,
        description: data.description ?? '',
        description_ru: data.description_ru,
        description_en: data.description_en,
        source_lang: data.source_lang ?? 'ru',
        language: data.language ?? null,
        start_date: data.start_date ?? '',
        end_date: data.end_date,
        start_time: data.start_time,
        end_time: data.end_time,
        city: data.city ?? '',
        address: data.address,
        lat: data.lat ?? 0,
        lng: data.lng ?? 0,
        category_id: data.category_id ?? '',
        website: data.website,
        contact: data.contact,
        contact_telegram: data.contact_telegram,
        contact_whatsapp: data.contact_whatsapp,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        price: data.price ?? null,
        donation: data.donation ?? false,
        currency: data.currency ?? null,
        photos: data.photos ?? [],
        owner_id: me.id,
        status: 'moderation',
      })
      .select()
      .single();
    if (error) throw error;
    return ev as EventItem;
  }

  async repeatEvent(id: string, start_date: string, end_date?: string): Promise<EventItem> {
    const me = await this.getCurrentUser();
    if (!me) throw new Error('Войдите как организатор');
    const { data: src, error: gErr } = await this.db
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (gErr || !src) throw new Error('Событие не найдено');
    const { data, error } = await this.db
      .from('events')
      .insert({
        title: src.title,
        title_ru: src.title_ru,
        title_en: src.title_en,
        description: src.description,
        description_ru: src.description_ru,
        description_en: src.description_en,
        source_lang: src.source_lang,
        start_date,
        end_date,
        start_time: src.start_time,
        end_time: src.end_time,
        city: src.city,
        address: src.address,
        lat: src.lat,
        lng: src.lng,
        category_id: src.category_id,
        website: src.website,
        contact: src.contact,
        contact_telegram: src.contact_telegram,
        contact_whatsapp: src.contact_whatsapp,
        contact_email: src.contact_email,
        contact_phone: src.contact_phone,
        contact_instagram: src.contact_instagram,
        price: src.price,
        currency: src.currency,
        country: src.country,
        language: src.language,
        donation: src.donation ?? false,
        photos: src.photos ?? [],
        owner_id: me.id,
        status: 'moderation',
      })
      .select()
      .single();
    if (error) throw error;
    return data as EventItem;
  }

  // --- Модерация и архив ---

  async approveEvent(id: string): Promise<void> {
    // Только через RPC (security definer + проверка is_admin), как rejectEvent
    const { error } = await this.db.rpc('approve_event', { ev_id: id });
    if (error) throw error;
  }

  async rejectEvent(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('reject_event', { ev_id: id, reason });
    if (error) throw error;
  }

  async incrementCounter(name: string): Promise<void> {
    try {
      await this.db.rpc('increment_counter', { counter_name: name });
    } catch {
      /* счётчик не критичен */
    }
  }

  async getStats(): Promise<Record<string, number>> {
    const { data, error } = await this.db.from('stats').select('name, value');
    if (error || !data) return {};
    const out: Record<string, number> = {};
    for (const row of data) out[row.name] = Number(row.value) || 0;
    return out;
  }

  async listArchived(): Promise<EventItem[]> {
    const me = await this.getCurrentUser();
    if (!me) return [];
    let q = this.db.from('events').select('*').eq('status', 'archived');
    if (me.role !== 'admin') {
      q = q.eq('owner_id', me.id);
    }
    const { data, error } = await q.order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EventItem[];
  }

  // --- История просмотров ---

  async addHistory(eventId: string): Promise<void> {
    const me = await this.getCurrentUser();
    if (!me) return;
    const { error } = await this.db.from('history').insert({ user_id: me.id, event_id: eventId });
    if (error) {
      // Уже было в истории — обновляем время просмотра
      await this.db
        .from('history')
        .update({ viewed_at: new Date().toISOString() })
        .eq('user_id', me.id)
        .eq('event_id', eventId);
    }
  }

  async listHistory(): Promise<HistoryItem[]> {
    const me = await this.getCurrentUser();
    if (!me) return [];
    const { data, error } = await this.db
      .from('history')
      .select('id, event_id, viewed_at, events(*)')
      .order('viewed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as HistoryItem[];
  }

  async clearHistory(): Promise<void> {
    const me = await this.getCurrentUser();
    if (!me) return;
    await this.db.from('history').delete().eq('user_id', me.id);
  }

  async removeHistory(id: string): Promise<void> {
    await this.db.from('history').delete().eq('id', id);
  }

  // --- Админка (управление) ---

  async adminLogin(_email: string, password: string): Promise<boolean> {
    // Админ входит обычной авторизацией; этот метод оставлен для совместимости
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

  async deleteModerationEvents(): Promise<number> {
    const { data, error } = await this.db.rpc('delete_moderation_events');
    if (error) throw error;
    return Number(data ?? 0);
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
    apiInstance = (config.demoMode ? new DemoApi() : new SupabaseApi()) as unknown as DataApi;
  }
  return apiInstance as DataApi;
}
