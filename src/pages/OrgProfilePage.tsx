// Страница публичного профиля организатора (#/org/<id>).
// Аватарка, имя, описание, контакты (только если contacts_public=true),
// активные события, подписка на email-рассылку о новых событиях.
// Доступна всем, без входа.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { getApi, photoUrl } from '../lib/api';
import { formatDate } from '../lib/dates';
import { localizedText } from '../lib/translate';
import { config } from '../config';
import { pushSupported, getBrowserSubscription, subscriptionData, urlBase64ToUint8Array } from '../lib/push';
import { navigate } from '../lib/navigate';
import type { OrgProfile, EventItem, Category, GalleryPhoto } from '../lib/types';

/** Ссылки на мессенджеры из произвольного формата ввода (как в EventCard) */
function tgLink(v: string) {
  const s = v.trim().replace(/^@/, '').replace(/^https?:\/\//, '');
  const m = s.match(/(?:t\.me\/|telegram\.me\/)?([a-zA-Z0-9_]+)/);
  return `https://t.me/${m ? m[1] : ''}`;
}
function waLink(v: string) {
  return `https://wa.me/${v.trim().replace(/[^\d]/g, '')}`;
}
function igLink(v: string) {
  const s = v.trim().replace(/^@/, '').replace(/\/+$/, '').split('/').pop() || '';
  return `https://instagram.com/${s}`;
}

/** Полный URL аватарки: http-ссылки как есть, пути хранилища через photoUrl */
function avatarSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : photoUrl(url);
}

/** Иконка человека (заглушка без аватарки и в карточке события) */
export function PersonIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

interface Props {
  orgId: string;
}

export default function OrgProfilePage({ orgId }: Props) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  // Галерея: фото + индекс открытого в лайтбоксе (null = закрыт)
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);

  // Подписка
  const [email, setEmail] = useState('');
  const [subMsg, setSubMsg] = useState('');
  const [subErr, setSubErr] = useState('');
  const [subBusy, setSubBusy] = useState(false);

  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  useEffect(() => {
    let alive = true;
    const api = getApi();
    setLoading(true);
    setProfile(null);
    setEvents([]);
    setSubMsg('');
    setSubErr('');
    (async () => {
      try {
        const [p, evs, cats, gals] = await Promise.all([
          api.getOrgProfile(orgId),
          api.listOrgEvents(orgId),
          api.getCategories(),
          // Галерея не должна ронять страницу при сетевой ошибке
          api.listOrgGallery(orgId).catch(() => []),
        ]);
        if (!alive) return;
        setProfile(p);
        setEvents(evs);
        setCategories(cats);
        setPhotos(gals);
      } catch {
        /* сетевые ошибки: страница остаётся пустой */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  // Escape закрывает лайтбокс
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  /** Клик по событию: карта + карточка события по чистому URL.
   *  Slug из названия подставит Home после загрузки события
   *  (replaceState на /event/<id>/<slugify(title)>). */
  function openEvent(id: string) {
    navigate(`/event/${encodeURIComponent(id)}`);
  }

  /** Подписка на рассылку (валидация на фронте, ответ RPC показываем как есть) */
  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubMsg('');
    setSubErr('');
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      setSubErr(t('org.invalidEmail'));
      return;
    }
    setSubBusy(true);
    try {
      const res = await getApi().subscribeOrg(orgId, em);
      if (res === 'already') setSubMsg(t('org.already'));
      else if (res === 'Organizer not found') setSubErr(t('org.notFound'));
      else setSubMsg(t('org.subscribed'));
    } catch {
      setSubErr(t('form.error'));
    } finally {
      setSubBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">
          {t('org.notFound')}
        </div>
      </div>
    );
  }

  // Контакты: RPC уже отфильтровал по contacts_public — показываем, что пришло
  const contacts = [
    profile.contact_telegram
      ? { key: 'telegram', href: tgLink(profile.contact_telegram), title: 'Telegram' }
      : null,
    profile.contact_whatsapp
      ? { key: 'whatsapp', href: waLink(profile.contact_whatsapp), title: 'WhatsApp' }
      : null,
    profile.instagram ? { key: 'instagram', href: igLink(profile.instagram), title: 'Instagram' } : null,
    profile.contact_email ? { key: 'email', href: `mailto:${profile.contact_email}`, title: 'Email' } : null,
    profile.contact_phone
      ? { key: 'phone', href: `tel:${profile.contact_phone.replace(/[^\d+]/g, '')}`, title: 'Phone' }
      : null,
  ].filter((c): c is { key: string; href: string; title: string } => c != null);

  const avatar = avatarSrc(profile.avatar_url);
  const name = profile.display_name || t('org.title');
  const orgEvents = events.filter((e) => e.owner_id === orgId);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-xl flex-1 p-4">
        {/* Шапка профиля */}
        <div className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <PersonIcon size={28} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">{name}</h1>
            {profile.bio && (
              <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Галерея — сразу после шапки, только если есть фото */}
        {photos.length > 0 && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('org.gallery')}</h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="block overflow-hidden rounded-lg focus:outline-none"
                >
                  <img
                    src={avatarSrc(p.photo_path) ?? undefined}
                    alt=""
                    className="aspect-square w-full object-cover transition-opacity hover:opacity-90"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Контакты — только если организатор включил contacts_public */}
        {contacts.length > 0 && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('org.contacts')}</h2>
            <div className="flex flex-wrap gap-2">
              {contacts.map((c) => (
                <a
                  key={c.key}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.title}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                >
                  {c.key === 'telegram' && (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  )}
                  {c.key === 'whatsapp' && (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                  )}
                  {c.key === 'instagram' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <rect x="2" y="2" width="20" height="20" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  )}
                  {c.key === 'email' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-10 6L2 7" />
                    </svg>
                  )}
                  {c.key === 'phone' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* События организатора */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('org.events')}</h2>
          {orgEvents.length === 0 ? (
            <p className="text-sm text-gray-500">{t('org.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {orgEvents.map((ev) => {
                const cat = categories.find((c) => c.id === ev.category_id);
                const evTitle = localizedText(ev.title, ev.title_ru, ev.title_en, ev.source_lang, lang);
                return (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => openEvent(ev.id)}
                      className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{evTitle}</span>
                        <span className="block text-xs text-gray-500">
                          {formatDate(ev.start_date, lang)}
                          {ev.end_date ? ` — ${formatDate(ev.end_date, lang)}` : ''} · {ev.city}
                        </span>
                      </span>
                      {cat && (
                        <span className="shrink-0 text-xs text-gray-500">
                          {cat.emoji} {lang === 'ru' ? cat.name_ru : cat.name_en}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Подписка на новые события */}
        <form onSubmit={subscribe} className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-gray-900">{t('org.subscribe')}</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSubErr('');
            }}
            placeholder={t('org.emailPlaceholder')}
            className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={subBusy}
            className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {subBusy ? '...' : t('org.subscribe')}
          </button>
          {subMsg && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{subMsg}</p>}
          {subErr && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{subErr}</p>}
        </form>

        {/* Браузерные push-уведомления о новых событиях организатора.
            Отдельная карточка; не пересекается с email-подпиской выше */}
        <OrgPushBlock orgId={orgId} />
      </div>

      {/* Лайтбокс: просмотр фото, стрелки ← →, Escape, клик по фону/крестик */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightbox(null);
          }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="✕"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xl text-white hover:bg-white/40"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => setLightbox((lightbox - 1 + photos.length) % photos.length)}
            aria-label="←"
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-xl text-white hover:bg-white/40"
          >
            ←
          </button>
          <img
            src={avatarSrc(photos[lightbox].photo_path) ?? undefined}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setLightbox((lightbox + 1) % photos.length)}
            aria-label="→"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-xl text-white hover:bg-white/40"
          >
            →
          </button>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {lightbox + 1} / {photos.length}
          </span>
        </div>
      )}
    </div>
  );
}

/** Браузерные push-уведомления организатора (#/org/<id>): подписка/отписка
 *  по клику (разрешение НЕ запрашивается при загрузке страницы). Работает и
 *  для гостей. Механика отдельная от email-подписки и от общего диджеста в
 *  профиле (push_subscriptions) — здесь подписка привязана к организатору. */
function OrgPushBlock({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Текущее состояние при открытии страницы: разрешение + подписка в БД.
  // Никаких запросов разрешения — только чтение.
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    (async () => {
      if (Notification.permission === 'denied') {
        if (alive) setDenied(true);
        return;
      }
      try {
        const sub = await getBrowserSubscription();
        if (!alive || !sub) return;
        const ok = await getApi().isPushSubscribed(orgId, sub.endpoint).catch(() => false);
        if (alive) setSubscribed(ok);
      } catch {
        // сетевые ошибки: остаёмся на кнопке «Подписаться»
      }
    })();
    return () => {
      alive = false;
    };
  }, [supported, orgId]);

  async function onSubscribe() {
    setBusy(true);
    setErr('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setErr(t('org.pushDenied'));
        return;
      }
      // Регистрация SW: путь от корня — страница /org/<id> вложенная,
      // относительный 'sw.js' ушёл бы в /org/sw.js
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
      });
      const { endpoint, p256dh, auth } = subscriptionData(sub);
      // База для ссылки из уведомления — корень сайта: страница /org/<id>
      // вложенная, hash-глубинная ссылка (#/?e=<id>) там не сработает
      const base = window.location.origin + '/';
      const res = await getApi().subscribePush(orgId, { endpoint, p256dh, auth }, lang, base);
      if (res === 'Organizer not found') {
        setErr(t('org.notFound'));
        return;
      }
      setSubscribed(true);
    } catch {
      setErr(t('org.pushError'));
    } finally {
      setBusy(false);
    }
  }

  async function onUnsubscribe() {
    setBusy(true);
    setErr('');
    try {
      const sub = await getBrowserSubscription();
      if (sub) {
        await getApi().unsubscribePush(orgId, sub.endpoint);
      }
      // Браузерную подписку НЕ гасим глобально: endpoint может использоваться
      // другими организаторами и диджест-подпиской в профиле
      setSubscribed(false);
    } catch {
      setErr(t('org.pushError'));
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null; // нет Web Push (напр. iOS Safari < 16.4) — блок скрыт

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-gray-900">{t('org.pushSubscribeTitle')}</h2>
      {denied ? (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{t('org.pushDenied')}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={subscribed ? onUnsubscribe : onSubscribe}
            disabled={busy}
            className="mt-3 w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? '...' : subscribed ? t('org.pushUnsubscribeButton') : t('org.pushSubscribeButton')}
          </button>
          {subscribed && <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{t('org.pushSubscribed')}</p>}
          {!subscribed && err && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </>
      )}
    </div>
  );
}
