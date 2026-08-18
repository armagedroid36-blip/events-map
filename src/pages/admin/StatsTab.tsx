// Вкладка «Статистика»: всего событий, активных, прошедших, новых заявок.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { todayIso } from '../../lib/dates';
import type { Application, EventItem } from '../../lib/types';

interface Props {
  version: number;
}

export default function StatsTab({ version }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [evs, aps, st] = await Promise.all([api.listAllEvents(), api.listApplications(), api.getStats()]);
      if (!alive) return;
      // Показываем и скрытые (прошедшие) события — поэтому берём полный список
      setEvents(evs);
      setApps(aps);
      setStats(st);
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  const today = todayIso();
  const total = events.length;
  const active = events.filter((e) => (e.end_date ?? e.start_date) >= today).length;
  const past = events.filter((e) => (e.end_date ?? e.start_date) < today).length;
  const newApps = apps.filter((a) => a.status === 'new').length;

  const cards = [
    { label: t('admin.stats.total'), value: total },
    { label: t('admin.stats.active'), value: active },
    { label: t('admin.stats.past'), value: past },
    { label: t('admin.stats.newApplications'), value: newApps },
    { label: t('admin.stats.visits'), value: stats.visits ?? 0 },
    { label: t('admin.stats.cardViews'), value: stats.card_views ?? 0 },
  ];

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-gray-900">{t('admin.stats.title')}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="mt-1 text-xs text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
