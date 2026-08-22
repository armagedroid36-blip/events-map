// Страница «Политика конфиденциальности» (#/privacy): статические тексты,
// язык — из глобального переключателя (i18n.language). Доступна всем без входа.
import { useTranslation } from 'react-i18next';

// Дата обновления политики (обновлять вручную при изменении текстов)
const UPDATED = '2026-08-22';

export default function Privacy() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US';
  const updated = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${UPDATED}T00:00:00`));

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-semibold text-gray-900">{t('privacy.title')}</h1>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="text-base font-semibold text-gray-900">{t('privacy.collect.title')}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {(t('privacy.collect.items', { returnObjects: true }) as string[]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">{t('privacy.use.title')}</h2>
          <p className="mt-2">{t('privacy.use.text')}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">{t('privacy.storage.title')}</h2>
          <p className="mt-2">{t('privacy.storage.text')}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">{t('privacy.rights.title')}</h2>
          <p className="mt-2">{t('privacy.rights.text')}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">{t('privacy.deleteAccount.title')}</h2>
          <p className="mt-2">{t('privacy.deleteAccount.text')}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">{t('privacy.operator.title')}</h2>
          <p className="mt-2">{t('privacy.operator.text')}</p>
        </section>
      </div>

      <p className="mt-8 text-xs text-gray-400">{t('privacy.updated', { date: updated })}</p>
    </div>
  );
}
