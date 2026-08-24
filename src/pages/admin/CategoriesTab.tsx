// Вкладка «Категории»: создание, редактирование, удаление.
// Удаление возможно только если к категории не привязаны события.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import type { Category, EventItem } from '../../lib/types';

interface Props {
  onChanged: () => void;
}

export default function CategoriesTab({ onChanged }: Props) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [cats, evs] = await Promise.all([api.getCategories(), api.listAllEvents()]);
      if (!alive) return;
      setCategories(cats);
      setEvents(evs);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave() {
    if (!editing?.name_ru?.trim() || !editing?.name_en?.trim() || !editing?.emoji) {
      setMessage({ kind: 'err', text: t('form.required') });
      return;
    }
    setMessage(null);
    try {
      const payload = {
        name_ru: editing.name_ru.trim(),
        name_en: editing.name_en.trim(),
        emoji: editing.emoji.trim(),
      };
      if (editing.id) await getApi().updateCategory(editing.id, payload);
      else await getApi().createCategory(payload);
      setEditing(null);
      onChanged();
    } catch {
      setMessage({ kind: 'err', text: 'Не удалось сохранить категорию' });
    }
  }

  async function handleDelete(id: string) {
    try {
      await getApi().deleteCategory(id);
      setConfirmDeleteId(null);
      setMessage({ kind: 'ok', text: 'OK' });
      onChanged();
    } catch {
      setMessage({ kind: 'err', text: t('admin.categories.deleteBlocked') });
      setConfirmDeleteId(null);
    }
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-gray-900 focus:outline-none';

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{t('admin.categories.title')}</h2>
        <button
          onClick={() => setEditing({ name_ru: '', name_en: '', emoji: '📍' })}
          className="ml-auto rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          + {t('admin.categories.add')}
        </button>
      </div>

      {message && message.kind === 'err' && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message.text}</p>
      )}

      {/* Форма добавления/редактирования */}
      {editing && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_80px_auto]">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t('admin.categories.nameRu')}</label>
              <input
                value={editing.name_ru ?? ''}
                onChange={(e) => setEditing({ ...editing, name_ru: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t('admin.categories.nameEn')}</label>
              <input
                value={editing.name_en ?? ''}
                onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{t('admin.categories.emoji')}</label>
              <input
                value={editing.emoji ?? ''}
                onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleSave}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                {t('admin.form.save')}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t('admin.form.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!categories.length && (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {t('admin.categories.empty')}
        </p>
      )}

      <div className="space-y-2">
        {categories.map((c) => {
          const used = events.filter((e) => e.category_id === c.id).length;
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <span className="text-xl">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{c.name_ru}</p>
                <p className="text-xs text-gray-500">
                  {c.name_en} • {used} {used === 1 ? 'event' : 'events'}
                </p>
              </div>
              <button
                onClick={() => setEditing({ ...c })}
                className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                {t('admin.events.edit')}
              </button>
              {confirmDeleteId === c.id ? (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="rounded bg-red-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-red-600"
                >
                  {t('admin.categories.deleteConfirm', { name: c.name_ru }).slice(0, 16)}…
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(c.id)}
                  className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                >
                  {t('admin.categories.delete')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
