// Окно входа / регистрации.
// Регистрация: выбор роли (пользователь / организатор).
// Организатор указывает контакты для связи (видит только админ).
// На шаге ввода кода подтверждения данные не теряются: черновик хранится
// в localStorage, при повторном открытии пользователь возвращается на шаг кода.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { AccountBlockedError, OtpError, getApi } from '../lib/api';
import { nextZ } from '../lib/zindex';
import { contactErrors, normalizeContacts } from '../lib/contacts';
import type { ContactErrorCode, ContactField } from '../lib/contacts';

// Черновик регистрации: сохраняется при переходе на шаг кода, удаляется
// при успешном подтверждении или явном «Изменить данные»
interface RegDraft {
  email: string;
  password: string;
  role: 'user' | 'org';
  telegram: string;
  whatsapp: string;
  phone: string;
  instagram: string;
  // Согласия (закон Вьетнама 91/2025, версия политики 2026-09-03):
  // consentTransfer — отдельное согласие на трансграничную передачу данных
  consent: boolean;
  consentTransfer: boolean;
}
const DRAFT_KEY = 'events-map-reg-draft';
const RESEND_SECONDS = 60;

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { signIn, signUp, confirmSignup } = useAuth();
  const z = useRef(nextZ()).current;
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'user' | 'org'>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telegram, setTelegram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Ошибки валидации контактов (сбрасываются при вводе)
  const [contactErr, setContactErr] = useState<Partial<Record<ContactField, ContactErrorCode>>>({});
  // Письмо со ссылкой восстановления отправлено (режим «Забыли пароль?»)
  const [resetSent, setResetSent] = useState(false);
  // Обязательное согласие на обработку персональных данных (только регистрация)
  const [consent, setConsent] = useState(false);
  // Отдельное согласие на трансграничную передачу данных (закон Вьетнама 91/2025)
  const [consentTransfer, setConsentTransfer] = useState(false);
  // Таймер повторной отправки кода (секунд до активации кнопки)
  const [resendIn, setResendIn] = useState(0);

  // Восстановление черновика: если регистрация была прервана на шаге кода,
  // возвращаемся на этот шаг с заполненными полями
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as RegDraft & { confirm?: boolean };
      if (!d.confirm) return;
      // Старый формат черновика (до 2026-09-03): отметок согласий в нём нет —
      // не восстанавливаем, пользователь отметит согласия заново
      if (!d.consent) return;
      setMode('register');
      setConfirm(true);
      setEmail(d.email ?? '');
      setPassword(d.password ?? '');
      setRole(d.role === 'org' ? 'org' : 'user');
      setTelegram(d.telegram ?? '');
      setWhatsapp(d.whatsapp ?? '');
      setPhone(d.phone ?? '');
      setInstagram(d.instagram ?? '');
      setConsent(Boolean(d.consent));
      setConsentTransfer(Boolean(d.consentTransfer));
    } catch {
      // Битый черновик — игнорируем, форма пустая
    }
  }, []);

  // Обратный отсчёт для повторной отправки кода
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  function saveDraft() {
    const norm = normalizeContacts({ telegram, whatsapp, phone, email, instagram });
    const d: RegDraft & { confirm: boolean } = {
      email,
      password,
      role,
      telegram: norm.telegram ?? '',
      whatsapp: norm.whatsapp ?? '',
      phone: norm.phone ?? '',
      instagram: norm.instagram ?? '',
      consent,
      consentTransfer,
      confirm: true,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  }

  // Восстановление пароля: отправка ссылки на почту.
  // Сообщение одинаковое для существующего и несуществующего email (безопасность)
  async function forgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await getApi().resetPassword(email);
      setResetSent(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('auth.error'));
    } finally {
      setBusy(false);
    }
  }

  // Повторная отправка кода подтверждения (новое письмо)
  async function resendCode() {
    setBusy(true);
    setErr('');
    try {
      const norm = normalizeContacts({ telegram, whatsapp, phone, email, instagram });
      await signUp(email, password, role, norm);
      setResendIn(RESEND_SECONDS);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('auth.error'));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (mode === 'login') {
        const ok = await signIn(email, password);
        if (!ok) {
          setErr(t('auth.wrong'));
          setBusy(false);
          return;
        }
      } else {
        // Регистрация: оба согласия обязательны. Кнопка disabled, но Enter
        // может отправить форму мимо неё — этот guard страхует
        if (!consent || !consentTransfer) {
          setErr(t('auth.consentRequired'));
          setBusy(false);
          return;
        }
        // Регистрация: проверяем контакты организатора (если заполнены)
        const cErr = contactErrors({ telegram, whatsapp, phone, email, instagram });
        if (Object.keys(cErr).length > 0) {
          setContactErr(cErr);
          setBusy(false);
          return;
        }
        const norm = normalizeContacts({ telegram, whatsapp, phone, email, instagram });
        // Отправляем запрос — на почту придёт код подтверждения.
        // Черновик сохраняем ДО перехода на шаг кода (данные переживают закрытие)
        await signUp(email, password, role, norm);
        saveDraft();
        setConfirm(true);
        setBusy(false);
        return;
      }
      onClose();
    } catch (ex) {
      // Заблокированный аккаунт — отдельное сообщение (не «неверный пароль»)
      if (ex instanceof AccountBlockedError) {
        setErr(t('auth.blocked'));
      } else {
        setErr(ex instanceof Error ? ex.message : t('auth.error'));
      }
    }
    setBusy(false);
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const norm = normalizeContacts({ telegram, whatsapp, phone, email, instagram });
      const ok = await confirmSignup(email, code, role, norm);
      if (ok) {
        localStorage.removeItem(DRAFT_KEY);
        onClose();
        return;
      }
      setErr(t('auth.wrongCode'));
    } catch (ex) {
      // OtpError → своё сообщение для каждого типа; шаг подтверждения не сбрасывается
      if (ex instanceof OtpError) {
        setErr(t(`auth.otp.${ex.code}`));
      } else {
        setErr(ex instanceof Error ? ex.message : t('auth.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  // Шаг подтверждения кодом из письма.
  // Клик по фону НЕ закрывает модалку (чтобы не потерять шаг); закрытие —
  // только через ✕. Данные при этом хранятся в черновике (localStorage).
  if (confirm) {
    return createPortal(
      <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25" style={{ zIndex: z }}>
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="glass-strong w-full max-w-md rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{t('auth.confirmTitle')}</h2>
              <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">{t('auth.codeSent', { email })}</p>
            <form onSubmit={confirmCode} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600">{t('auth.code')}</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-center text-lg tracking-[0.5em] focus:border-gray-900 focus:outline-none"
                />
              </div>
              {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
              <button
                type="submit"
                disabled={busy || code.trim().length < 4}
                className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {busy ? '...' : t('auth.confirm')}
              </button>
            </form>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(DRAFT_KEY);
                  setConfirm(false);
                  setErr('');
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← {t('auth.backToForm')}
              </button>
              <button
                type="button"
                onClick={resendCode}
                disabled={busy || resendIn > 0}
                className="text-sm font-medium text-gray-900 underline hover:text-gray-700 disabled:opacity-50"
              >
                {resendIn > 0 ? t('auth.resendWait', { sec: resendIn }) : t('auth.resend')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/25" style={{ zIndex: z }} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="glass-strong w-full max-w-md rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'forgot'
              ? t('auth.resetTitle')
              : mode === 'login'
                ? t('auth.loginTitle')
                : t('auth.registerTitle')}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="close">
            ✕
          </button>
        </div>

        {/* Переключение режима (не показываем на шаге восстановления пароля) */}
        {mode !== 'forgot' && (
          <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md py-1.5 ${mode === 'login' ? 'bg-white font-medium text-gray-900 shadow' : 'text-gray-500'}`}
            >
              {t('auth.login')}
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 rounded-md py-1.5 ${mode === 'register' ? 'bg-white font-medium text-gray-900 shadow' : 'text-gray-500'}`}
            >
              {t('auth.register')}
            </button>
          </div>
        )}

        {/* Восстановление пароля: поле email + отправка ссылки */}
        {mode === 'forgot' && (
          <div className="space-y-3">
            {resetSent ? (
              <p className="rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-800">{t('auth.resetSent')}</p>
            ) : (
              <form onSubmit={forgotSubmit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">{t('auth.email')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </div>
                {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {busy ? '...' : t('auth.resetSubmit')}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setResetSent(false);
                setErr('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {t('auth.backToLogin')}
            </button>
          </div>
        )}

        {mode !== 'forgot' && (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('auth.email')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">{t('auth.password')}</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          {mode === 'register' && (
            <>
              {/* Выбор роли */}
              <div>
                <label className="mb-1 block text-sm text-gray-600">{t('auth.role')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('user')}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      role === 'user' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    {t('auth.roleUser')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('org')}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      role === 'org' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    {t('auth.roleOrg')}
                  </button>
                </div>
              </div>

              {/* Контакты организатора */}
              {role === 'org' && (
                <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{t('auth.orgContactsHint')}</p>
                  <div>
                    <input
                      value={telegram}
                      onChange={(e) => {
                        setTelegram(e.target.value);
                        setContactErr((prev) => ({ ...prev, telegram: undefined }));
                      }}
                      placeholder={t('auth.contactTelegram')}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    {contactErr.telegram && (
                      <p className="mt-1 text-xs text-red-600">{t(`form.${contactErr.telegram}`)}</p>
                    )}
                  </div>
                  <div>
                    <input
                      value={whatsapp}
                      onChange={(e) => {
                        setWhatsapp(e.target.value);
                        setContactErr((prev) => ({ ...prev, whatsapp: undefined }));
                      }}
                      placeholder={t('auth.contactWhatsapp')}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    {contactErr.whatsapp && (
                      <p className="mt-1 text-xs text-red-600">{t(`form.${contactErr.whatsapp}`)}</p>
                    )}
                  </div>
                  <div>
                    <input
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setContactErr((prev) => ({ ...prev, phone: undefined }));
                      }}
                      placeholder={t('auth.contactPhone')}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    {contactErr.phone && (
                      <p className="mt-1 text-xs text-red-600">{t(`form.${contactErr.phone}`)}</p>
                    )}
                  </div>
                  <div>
                    <input
                      value={instagram}
                      onChange={(e) => {
                        setInstagram(e.target.value);
                        setContactErr((prev) => ({ ...prev, instagram: undefined }));
                      }}
                      placeholder={t('auth.contactInstagram')}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    {contactErr.instagram && (
                      <p className="mt-1 text-xs text-red-600">{t(`form.${contactErr.instagram}`)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Обязательное согласие на обработку персональных данных */}
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900"
                />
                <span className="text-sm leading-snug text-gray-600">
                  <Trans i18nKey="auth.consent">
                    <a
                      href="#/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gray-900 underline hover:text-gray-700"
                    >
                      Privacy Policy
                    </a>
                  </Trans>
                </span>
              </label>

              {/* Отдельное согласие на трансграничную передачу (закон Вьетнама 91/2025) */}
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={consentTransfer}
                  onChange={(e) => setConsentTransfer(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900"
                />
                <span className="text-sm leading-snug text-gray-600">
                  <Trans i18nKey="auth.consentTransfer" />
                </span>
              </label>
            </>
          )}

          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <button
            type="submit"
            disabled={busy || (mode === 'register' && (!consent || !consentTransfer))}
            className="w-full rounded-md bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? '...' : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>

          {/* Ссылка «Забыли пароль?» — только на форме входа */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setErr('');
              }}
              className="block w-full text-center text-sm text-gray-500 underline hover:text-gray-700"
            >
              {t('auth.forgot')}
            </button>
          )}
        </form>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
