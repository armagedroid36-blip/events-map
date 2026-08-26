// Вкладка «Пользователи» (админка): список пользователей и организаторов
// со статистикой по событиям и категориям, статусом блокировки,
// блокировка/разблокировка + экспорт в .xlsx (exceljs).
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { UserStatsRow, UserRole } from '../../lib/types';

interface Props {
  version: number;
}

export default function UsersTab({ version }: Props) {
  const { t, i18n } = useTranslation();
  const { user: me } = useAuth();
  const [rows, setRows] = useState<UserStatsRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // id строки, для которой выполняется блокировка/разблокировка
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const lang = i18n.language.startsWith('ru') ? 'ru' : 'en';

  const load = useCallback(async () => {
    try {
      const data = await getApi().listUsersStats();
      setRows(data);
      setError('');
    } catch {
      setError(t('admin.users.empty'));
    }
  }, [t]);

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
    t('admin.users.colStatus'),
    t('admin.users.colTotal'),
    t('admin.users.colActive'),
    t('admin.users.colModeration'),
    t('admin.users.colRejected'),
    t('admin.users.colArchived'),
    t('admin.users.colNeedsChanges'),
    t('admin.users.colCategories'),
    '',
  ];

  // Блокировка/разблокировка: подтверждение только перед блокировкой,
  // после успеха — перезагрузка списка (статус и события обновляются)
  async function toggleBlock(r: UserStatsRow) {
    const blocked = !!r.blocked_at;
    if (!blocked && !window.confirm(t('admin.users.blockConfirm', { email: r.email }))) return;
    setActionId(r.user_id);
    setActionError('');
    try {
      if (blocked) await getApi().unblockUser(r.user_id);
      else await getApi().blockUser(r.user_id);
      await load();
    } catch {
      setActionError(blocked ? t('admin.users.unblockError') : t('admin.users.blockError'));
    } finally {
      setActionId(null);
    }
  }

  async function exportXlsx() {
    setBusy(true);
    try {
      // Динамический импорт — exceljs не попадает в бандл публичной части
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const wsUsers = wb.addWorksheet(t('admin.users.sheetUsers'));
      wsUsers.addRow(headerCells);
      for (const r of sorted) {
        wsUsers.addRow([
          r.email,
          roleLabel(r.role),
          (r.created_at || '').slice(0, 10),
          contactsOf(r),
          r.blocked_at ? `${t('admin.users.blockedLabel')} ${(r.blocked_at || '').slice(0, 10)}` : '',
          r.events_total,
          r.events_active,
          r.events_moderation,
          r.events_rejected,
          r.events_archived,
          r.events_needs_changes,
          r.categories.map((c) => `${catName(c)}: ${c.count}`).join(', '),
        ]);
      }
      const wsCats = wb.addWorksheet(t('admin.users.sheetCategories'));
      wsCats.addRow([t('admin.users.colUser'), t('admin.users.colCategory'), t('admin.users.colCount')]);
      for (const r of sorted) {
        for (const c of r.categories) wsCats.addRow([r.email, catName(c), c.count]);
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-stats-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
      {actionError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {sorted.length === 0 && !error ? (
        <p className="text-sm text-gray-500">{t('admin.users.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                {headerCells.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
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
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.blocked_at ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {t('admin.users.blockedLabel')} · {(r.blocked_at || '').slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
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
                  <td className="whitespace-nowrap px-3 py-2">
                    {me && r.user_id === me.id ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : r.role === 'admin' ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <button
                        onClick={() => toggleBlock(r)}
                        disabled={actionId === r.user_id}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                          r.blocked_at
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {actionId === r.user_id
                          ? '…'
                          : r.blocked_at
                            ? t('admin.users.unblock')
                            : t('admin.users.block')}
                      </button>
                    )}
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
