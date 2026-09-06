// Страница «Обратная связь» (#/contacts): выбор канала — почта или Telegram-бот.
// Доступна всем без входа. Язык — из глобального переключателя (i18n.language).
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';

const FEEDBACK_EMAIL = 'armagedroid36@gmail.com';
const FEEDBACK_BOT = 'https://t.me/Eventsmap_feedback_bot';

export default function Contacts() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-2xl flex-1 p-4">
        <h1 className="text-xl font-semibold text-gray-900">{t('contacts.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{t('contacts.hint')}</p>
        <div className="mt-6 space-y-3">
          <a
            href={`mailto:${FEEDBACK_EMAIL}`}
            className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
          >
            {t('contacts.email')}
          </a>
          <a
            href={FEEDBACK_BOT}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
          >
            {t('contacts.telegram')}
          </a>
        </div>
      </div>
    </div>
  );
}
