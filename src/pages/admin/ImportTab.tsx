// Вкладка «Импорт»: быстрое наполнение базы из CSV/JSON.
// Колонки: title, description, start_date (ГГГГ-ММ-ДД), end_date, city,
// address, lat, lng, category, website. Название и описание переводятся
// автоматически при сохранении.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/api';
import { geocodeAddress } from '../../lib/geocode';
import type { Category, ImportRow } from '../../lib/types';

interface Props {
  onChanged: () => void;
}

/** Простой парсер CSV с поддержкой кавычек */
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  function splitLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  const headers = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] ?? '').trim();
    });
    return row;
  });
}

export default function ImportTab({ onChanged }: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Категории нужны для сопоставления по имени из файла
  useState(() => {
    getApi().getCategories().then(setCategories);
  });

  /** Чтение и импорт выбранного файла */
  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      let rows: Array<Record<string, string>>;
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('JSON должен быть массивом объектов');
        rows = data.map((r: Record<string, unknown>) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) out[k.toLowerCase()] = String(v ?? '');
          return out;
        });
      } else {
        rows = parseCsv(text);
      }
      if (!rows.length) throw new Error('Файл пуст');

      // Преобразуем строки в ImportRow, определяя категорию по имени
      const importRows: ImportRow[] = [];
      for (const r of rows) {
        if (!r.title || !r.start_date) continue;
        let category_id = '';
        if (r.category) {
          const cat = categories.find(
            (c) =>
              c.name_ru.toLowerCase() === r.category.toLowerCase() ||
              c.name_en.toLowerCase() === r.category.toLowerCase() ||
              c.id.toLowerCase() === r.category.toLowerCase(),
          );
          category_id = cat?.id ?? '';
        }
        let lat = r.lat ? parseFloat(r.lat) : NaN;
        let lng = r.lng ? parseFloat(r.lng) : NaN;
        // Нет координат — пробуем найти по адресу/городу (Nominatim, 1 запрос/сек)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          const query = `${r.address ?? ''} ${r.city ?? ''}`.trim();
          if (query) {
            const coords = await geocodeAddress(query);
            if (coords) {
              lat = coords.lat;
              lng = coords.lng;
            }
          }
        }
        importRows.push({
          title: r.title,
          description: r.description || undefined,
          start_date: r.start_date,
          end_date: r.end_date || undefined,
          city: r.city ?? '',
          address: r.address || undefined,
          lat: Number.isFinite(lat) ? lat : undefined,
          lng: Number.isFinite(lng) ? lng : undefined,
          category_id: category_id || undefined,
          website: r.website || undefined,
        });
      }

      const count = await getApi().importEvents(importRows);
      setResult({ kind: 'ok', text: t('admin.import.result', { count }) });
      onChanged();
    } catch (e) {
      setResult({ kind: 'err', text: t('admin.import.error', { message: (e as Error).message }) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** Пример CSV для скачивания */
  function downloadSample() {
    const sample = [
      'title,description,start_date,end_date,city,address,lat,lng,category,website',
      'Sunset Yoga on the Beach,Morning flow at Batu Bolong beach,2026-09-01,,Canggu,Jl. Pantai Batu Bolong,-8.6446,115.1353,Yoga,https://example.com',
      'Bali Food Festival,Taste of Bali,2026-10-05,2026-10-07,Ubud,Jl. Raya Ubud,-8.5069,115.2625,Food,https://example.com',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'events-sample.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-gray-900">{t('admin.import.title')}</h2>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">{t('admin.import.hint')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="block w-full max-w-sm text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700"
        />
        {busy && <span className="text-sm text-gray-500">{t('common.loading')}…</span>}
      </div>

      {result && (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            result.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {result.text}
        </p>
      )}

      <button
        onClick={downloadSample}
        className="mt-4 text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
      >
        {t('admin.import.sample')}
      </button>
    </div>
  );
}
