// Вкладка «Статистика»: суммарные карточки + динамика счётчиков
// (visits, card_views) по дням/месяцам/годам. Агрегация — на клиенте,
// данные из RPC admin_stats_history (только админ).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { todayIso } from '../../lib/dates';
import { aggregateDays, aggregateMonths, aggregateYears, type StatsPoint } from '../../lib/statsHistory';
import type { Application, EventItem, StatsDailyRow } from '../../lib/types';

interface Props {
  version: number;
}

type Period = 'day' | 'month' | 'year';

const BAR_VISITS = '#3b82f6'; // синий
const BAR_CARD_VIEWS = '#f59e0b'; // янтарный

/** Простой SVG-барчарт без библиотек: две серии, подписи оси X, tooltip на баре */
function BarChart({ points }: { points: StatsPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const H = 210;
  const padL = 30;
  const padB = 26;
  const padT = 10;

  // Ширина = контейнер (ResizeObserver), чтобы подписи не сжимались на мобильном
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(280, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxVal = Math.max(1, ...points.map((p) => Math.max(p.visits, p.cardViews)));
  const innerW = w - padL;
  const innerH = H - padT - padB;
  const slot = points.length > 0 ? innerW / points.length : innerW;
  const barW = Math.min(16, Math.max(3, slot * 0.3));
  const yFor = (v: number) => padT + innerH - (v / maxVal) * innerH;
  // Подписи оси X реже при большом числе точек: 30 -> каждая 5-я, 12 -> каждая 2-я
  const labelStep = points.length > 20 ? 5 : points.length > 8 ? 2 : 1;

  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-hidden="true">
        {/* Сетка: 0, середина, максимум */}
        {[0, 0.5, 1].map((f) => {
          const y = padT + innerH - f * innerH;
          return (
            <g key={f}>
              <line x1={padL} x2={w - 2} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              {f > 0 && (
                <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
                  {Math.round(maxVal * f)}
                </text>
              )}
            </g>
          );
        })}
        {points.map((p, i) => {
          const cx = padL + i * slot + slot / 2;
          const base = padT + innerH;
          return (
            <g key={p.key}>
              <rect
                x={cx - barW - 1}
                y={yFor(p.visits)}
                width={barW}
                height={Math.max(0, base - yFor(p.visits))}
                rx={2}
                fill={BAR_VISITS}
              >
                <title>{`${p.label}: ${p.visits}`}</title>
              </rect>
              <rect
                x={cx + 1}
                y={yFor(p.cardViews)}
                width={barW}
                height={Math.max(0, base - yFor(p.cardViews))}
                rx={2}
                fill={BAR_CARD_VIEWS}
              >
                <title>{`${p.label}: ${p.cardViews}`}</title>
              </rect>
              {i % labelStep === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={9} fill="#6b7280">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function StatsTab({ version }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  // null = ещё грузится, [] = данных нет (демо/новая база)
  const [history, setHistory] = useState<StatsDailyRow[] | null>(null);
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    let alive = true;
    (async () => {
      const api = getApi();
      const [evs, aps, st, hist] = await Promise.all([
        api.listAllEvents(),
        api.listApplications(),
        api.getStats(),
        // Динамика не должна ронять вкладку, если RPC недоступен
        api.getStatsHistory().catch(() => []),
      ]);
      if (!alive) return;
      // Показываем и скрытые (прошедшие) события — поэтому берём полный список
      setEvents(evs);
      setApps(aps);
      setStats(st);
      setHistory(hist);
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

  const rows = history ?? [];
  const points =
    period === 'day'
      ? aggregateDays(rows)
      : period === 'month'
        ? aggregateMonths(rows)
        : aggregateYears(rows);
  const totals = {
    visits: points.reduce((s, p) => s + p.visits, 0),
    cardViews: points.reduce((s, p) => s + p.cardViews, 0),
  };

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

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('admin.stats.dynamics')}</h3>
        <div className="mb-3 inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['day', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t(`admin.stats.${p}`)}
            </button>
          ))}
        </div>

        {history === null ? (
          <p className="text-sm text-gray-500">…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">{t('admin.stats.noData')}</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{totals.visits}</p>
                <p className="mt-0.5 text-xs text-gray-500">{t('admin.stats.visits')}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{totals.cardViews}</p>
                <p className="mt-0.5 text-xs text-gray-500">{t('admin.stats.cardViews')}</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{t(`admin.stats.${period}`)}</span>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: BAR_VISITS }}
                    />
                    {t('admin.stats.visits')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: BAR_CARD_VIEWS }}
                    />
                    {t('admin.stats.cardViews')}
                  </span>
                </div>
              </div>
              <BarChart points={points} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
