# События на карте — Events on the Map

Интерактивная карта событий (конференции, выставки, концерты, спорт, лекции, вечеринки).
Географический фокус — **Бали и Юго-Восточная Азия**, мир показывается целиком.
Сайт на двух языках: **русский и английский** (полная локализация, переключатель в шапке,
язык по умолчанию — по языку браузера посетителя).

## Что умеет сайт

**Для посетителей:**
- Интерактивная карта мира (Leaflet + тайлы Carto Voyager — бесплатно, без ключей, названия на латинице/английском)
- При открытии: геолокация посетителя (если разрешена), иначе — Юго-Восточная Азия
- Быстрые кнопки направлений: Бали, Бангкок, Сингапур, Хошимин, Куала-Лумпур, Джакарта
- Маркеры-эмодзи по категориям, кластеризация при отдалении
- Фильтры: категория, период, город, ключевые слова
- Список событий рядом с картой (на мобильных — ниже), сортировка по дате
- Карточка события: название, даты, город, описание, категория, ссылка, фото (до 5)
- Пустые состояния: «По вашему запросу ничего не найдено»
- Адаптивность: десктоп, планшет, смартфон

**Для организаторов:**
- Кнопка «Разместить событие» — форма: название и описание на любом языке,
  даты, город, адрес (автоматически превращается в точку на карте), категория,
  сайт, контакты, фото. После отправки событие уходит на модерацию.

**Для администратора (адрес `#/admin`):**
- Модерация заявок: принять / отклонить (с причиной)
- События: список с поиском и пагинацией, добавление, редактирование, удаление
- Категории: создание (название RU/EN + эмодзи), редактирование, удаление
  (только если к категории нет привязанных событий)
- Статистика: всего, активных, прошедших, новых заявок
- Импорт событий из CSV/JSON (быстрое наполнение базы)

**Языки и перевод:**
- Интерфейс полностью на русском и английском (react-i18next, без перезагрузки)
- Организатор пишет название/описание на любом языке; при сохранении событие
  автоматически переводится на второй язык (перевод хранится в базе, выполняется
  один раз). Если перевода нет — посетитель видит оригинал.
- Город и адрес — единые, без перевода.

## Технологии (всё бесплатное)

| Часть | Технология |
|---|---|
| Фронтенд | React 19 + TypeScript + Tailwind CSS 4 |
| Карта | Leaflet + Carto Voyager (тайлы с латиницей) + leaflet.markercluster |
| Языки | i18next + react-i18next |
| Валидация | zod |
| База данных | Supabase (PostgreSQL + auth + storage) |
| Деплой | Vercel / Netlify (или любой хостинг статики / Node.js) |

## Как запустить локально

Требуется Node.js 20+.

```bash
npm install     # установить зависимости (один раз)
npm run dev     # запустить сайт на http://localhost:5173
```

Сборка для публикации:

```bash
npm run build   # готовый сайт появится в папке dist/
npm run preview # посмотреть собранную версию
```

## Структура проекта

```
src/
  config.ts            <- ЕДИНЫЙ ФАЙЛ НАСТРОЕК (адрес базы, демо-режим)
  i18n/                <- русские и английские строки интерфейса
  lib/
    api.ts             <- слой данных: единый интерфейс (демо / Supabase)
    demo.ts            <- демо-режим: работает без базы (localStorage)
    types.ts           <- типы: событие, категория, заявка
    translate.ts       <- перевод контента (вызов серверной функции)
    geocode.ts         <- адрес -> координаты (OpenStreetMap Nominatim)
    dates.ts           <- работа с датами
  components/          <- шапка, карта, фильтры, список, карточка, форма
  pages/
    Home.tsx           <- публичная страница
    Admin.tsx          <- админ-панель (вкладки: статистика, модерация,
                           события, категории, импорт)
```

## Демо-режим (по умолчанию)

Сейчас сайт работает **без базы данных** — с примерами событий, которые
хранятся в браузере (localStorage). Это сделано, чтобы проверить внешний вид
и поведение до подключения настоящей базы. В демо-режиме:
- на карте показаны 6 примеров событий Бали/ЮВА;
- форма «Разместить событие» работает (заявка сохраняется в браузере и
  видна в админке на вкладке «Модерация»);
- админка открывается без входа.

Демо-режим включается/выключается в `src/config.ts` (флаг `demoMode`).

## Подключение базы Supabase (бесплатно)

1. Зарегистрируйтесь на https://supabase.com и создайте проект.
2. В панели Supabase создайте таблицы (SQL-редактор → New query):

```sql
-- Категории событий
create table categories (
  id text primary key,
  name_ru text not null,
  name_en text not null,
  emoji text not null
);

-- События (оригинал + переводы, перевод выполняется один раз при сохранении)
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ru text,
  title_en text,
  description text not null default '',
  description_ru text,
  description_en text,
  source_lang text not null default 'ru',
  start_date date not null,
  end_date date,
  city text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  category_id text references categories(id),
  website text,
  contact text,
  photos jsonb not null default '[]',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Заявки организаторов (до модерации)
create table applications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  source_lang text not null default 'ru',
  start_date date not null,
  end_date date,
  city text not null,
  address text,
  lat double precision,
  lng double precision,
  category_id text references categories(id),
  website text,
  contact text,
  photos jsonb not null default '[]',
  status text not null default 'new',
  reject_reason text,
  created_at timestamptz not null default now()
);

-- Разрешить чтение всем (публичная часть)
alter table events enable row level security;
alter table applications enable row level security;
create policy "public read events" on events for select using (status = 'active');
create policy "anyone can apply" on applications for insert with check (true);
```

3. В корне проекта создайте файл `.env` (он уже в `.gitignore`):

```
VITE_SUPABASE_URL=https://ВАШ-ПРОЕКТ.supabase.co
VITE_SUPABASE_ANON_KEY=ваш-публичный-ключ
```

Ключи — в панели Supabase: Project Settings → API. `anon key` — публичный,
его можно хранить в коде сайта (это нормально).

4. В `src/config.ts` поставьте `demoMode: false` и перезапустите `npm run dev`.

### Функция перевода (Edge Function)

Перевод контента выполняется серверной функцией Supabase (чтобы ключ перевода
не попадал в браузер). Файл — `supabase/functions/translate/index.ts`.
Секрет (ключ DeepSeek или другого API) добавляется в панели Supabase:
Project Settings → Edge Functions → Secrets. В демо-режиме перевод не
выполняется — посетитель видит оригинал (это предусмотренное поведение).

## Деплой

### Вариант 1. Vercel (рекомендую — проще всего)

1. Создайте аккаунт на https://vercel.com (можно через GitHub).
2. `npm i -g vercel`, затем в папке проекта: `vercel` — ответьте на вопросы
   (Framework: Vite; Build: `npm run build`; Output: `dist`).
3. Vercel сам выдаст адрес вида `events-map.vercel.app`.
4. Свой домен: в панели Vercel → Domains → добавьте домен и пропишите
   DNS-запись, которую покажет Vercel.

### Вариант 2. Netlify

1. Аккаунт на https://netlify.com.
2. Перетащите папку `dist/` на https://app.netlify.com/drop — сайт поднимется.
3. Домен: Site settings → Domain management.

### Вариант 3. Любой сервер с Node.js (VPS)

```bash
npm install
npm run build
# отдать папку dist/ любым статическим сервером, например:
npx serve dist
# или поставить nginx и указать корнем dist/
```

## Перенос на другой сервер / другую базу

Сайт состоит из двух независимых частей:
- **код** (папка проекта) — переносится куда угодно, пересборка одной командой `npm run build`;
- **данные** (Supabase) — хранятся отдельно, переезд кода их не затрагивает.

При переносе меняется **только** файл `src/config.ts` (или `.env`):
адрес базы и ключ. Данные остаются в Supabase. «Переехать» с Vercel на Netlify
или VPS = скопировать код, собрать, указать те же настройки базы.

## Git

Код уже инициализирован как git-репозиторий. Для публикации на GitHub:

```bash
git add .
git commit -m "MVP: карта событий Бали и Юго-Восточной Азии"
git remote add origin https://github.com/ВАШ-АККАУНТ/events-map.git
git push -u origin main
```

## Этап 2 (не входит в MVP, но заложено в архитектуру)

- Импорт событий из внешних фидов (JSON, ICS-календари) — через тот же
  слой данных `src/lib/api.ts`
- Парсинг сайтов-агрегаторов событий
- Полуавтоматическое заполнение с помощью ИИ (даты, город, категория из описания)
