// Вкладка «Пользователи» (админка): список пользователей и организаторов
// со статистикой по событиям и категориям + экспорт в .xlsx (SheetJS).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import type { UserStatsRow, UserRole } from '../../lib/types';

interface Props {
  version: number;
}

export default function UsersTab({ version }: Props) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<UserStatsRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getApi().listUsersStats();
        if (!alive) return;
        setRows(data);
        setError('');
      } catch {
        if (!alive) return;
        setRows([]);
        setError(t('admin.users.empty'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [version, t]);

  const roleLabel = (role: UserRole): string =>
    role === 'admin' ? t('auth.roleAdmin') : role === 'org' ? t('auth.roleOrg') : t('auth.roleUser');

  const catName = (c: UserStatsRow['categories'][number]): string =>
    lang === 'ru' ? c.name_ru : c.name_en;

  const contactsOf = (r: UserStatsRow): string =>
    [r.contact_telegram, r.contact_whatsapp, r.contact_phone, r.instagram]
      .filter((x): x is string => !!x)
      .join(', ');

  // Сортировка по умолчанию: события по убыванию, затем email
  const sorted = [...rows].sort(
    (a, b) => b.events_total - a.events_total || a.email.localeCompare(b.email),
  );

  const headerCells = [
    t('admin.users.colUser'),
    t('admin.users.colRole'),
    t('admin.users.colRegistered'),
    t('admin.users.colContacts'),
    t('admin.users.colTotal'),
    t('admin.users.colActive'),
    t('admin.users.colModeration'),
    t('admin.users.colRejected'),
    t('admin.users.colArchived'),
    t('admin.users.colNeedsChanges'),
    t('admin.users.colCategories'),
  ];

  async function exportXlsx() {
    setBusy(true);
    try {
      // Динамический импорт — xlsx не попадает в бандл публичной части
      const XLSX = await import('xlsx');
      const usersData = sorted.map((r) => [
        r.email,
        roleLabel(r.role),
        (r.created_at || '').slice(0, 10),
        contactsOf(r),
        r.events_total,
        r.events_active,
        r.events_moderation,
        r.events_rejected,
        r.events_archived,
        r.events_needs_changes,
        r.categories.map((c) => `${catName(c)}: ${c.count}`).join(', '),
      ]);
      const sheetUsers = XLSX.utils.aoa_to_sheet([headerCells, ...usersData]);
      const sheetCats = XLSX.utils.aoa_to_sheet([
        [t('admin.users.colUser'), t('admin.users.colCategory'), t('admin.users.colCount')],
        ...sorted.flatMap((r) =>
          r.categories.map((c) => [r.email, catName(c), c.count]),
        ),
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheetUsers, t('admin.users.sheetUsers'));
      XLSX.utils.book_append_sheet(wb, sheetCats, t('admin.users.sheetCategories'));
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `users-stats-${date}.xlsx`);
    } catch {
      // Молча: экспорт не критичен, кнопка остаётся доступной
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">{t('admin.users.title')}</h2>
        <button
          onClick={exportXlsx}
          disabled={busy || sorted.length === 0}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? '…' : t('admin.users.export')}
        </button>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {sorted.length === 0 && !error ? (
        <p className="text-sm text-gray-500">{t('admin.users.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                {headerCells.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.user_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900">{r.email}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{roleLabel(r.role)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {(r.created_at || '').slice(0, 10)}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-gray-600" title={contactsOf(r)}>
                    {contactsOf(r) || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{r.events_total}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.events_active}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.events_moderation}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.events_rejected}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.events_archived}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.events_needs_changes}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-gray-600" title={r.categories.map((c) => `${catName(c)}: ${c.count}`).join(', ')}>
                    {r.categories.map((c) => `${catName(c)}: ${c.count}`).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
