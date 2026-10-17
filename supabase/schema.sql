-- Схема базы данных дашборда статистики Instagram, версия 2.0 (октябрь 2026).
-- Выполните этот файл целиком в Supabase: SQL Editor -> New query -> вставить -> Run.
--
-- Файл подходит и для новой базы, и для обновления базы версии 1.0:
-- он ничего не удаляет, а повторный запуск ничего не ломает.

-- ---------------------------------------------------------------------------
-- Базовые таблицы версии 1.0
-- ---------------------------------------------------------------------------

create table if not exists accounts (
  id text primary key,              -- Instagram Business Account ID
  username text not null,           -- @username
  display_name text not null,       -- название на сайте
  page_id text,                     -- ID связанной Facebook-страницы (необязательно)
  created_at timestamptz default now()
);

-- Старая дневная таблица. Новая версия в неё не пишет, но данные сохраняем.
create table if not exists daily_account_stats (
  id bigint generated always as identity primary key,
  account_id text references accounts(id) not null,
  date date not null,
  reach bigint default 0,
  impressions bigint default 0,
  follower_count bigint default 0,
  profile_views bigint default 0,
  created_at timestamptz default now(),
  unique (account_id, date)
);

create table if not exists posts (
  id text primary key,              -- Instagram media ID
  account_id text references accounts(id) not null,
  media_type text,                  -- IMAGE, VIDEO, CAROUSEL_ALBUM
  caption text,
  permalink text,
  thumbnail_url text,               -- временная ссылка Instagram
  posted_at timestamptz,
  likes bigint default 0,
  comments bigint default 0,
  saved bigint default 0,
  shares bigint default 0,
  reach bigint default 0,
  updated_at timestamptz default now()
);

create table if not exists stories (
  id text primary key,              -- Instagram media ID
  account_id text references accounts(id) not null,
  posted_at timestamptz,
  reach bigint default 0,
  impressions bigint default 0,
  replies bigint default 0,
  exits bigint default 0,
  captured_at timestamptz default now()
);

create index if not exists idx_daily_stats_account_date on daily_account_stats(account_id, date);
create index if not exists idx_posts_account on posts(account_id, posted_at desc);
create index if not exists idx_stories_account on stories(account_id, posted_at desc);

-- ---------------------------------------------------------------------------
-- Версия 2.0
-- ---------------------------------------------------------------------------

-- 1. Аккаунты: профиль и флаг «отслеживать»
alter table accounts alter column page_id drop not null;
alter table accounts add column if not exists name text;
alter table accounts add column if not exists biography text;
alter table accounts add column if not exists website text;
alter table accounts add column if not exists avatar_url text;
alter table accounts add column if not exists followers_count bigint;
alter table accounts add column if not exists follows_count bigint;
alter table accounts add column if not exists media_count bigint;
alter table accounts add column if not exists is_active boolean not null default true;
alter table accounts add column if not exists profile_updated_at timestamptz;

-- 2. Дневная статистика аккаунта. Один день = сутки Instagram (по тихоокеанскому времени).
create table if not exists account_daily (
  account_id text not null references accounts(id) on delete cascade,
  date date not null,
  followers bigint,                 -- подписчиков на конец дня
  followers_source text,            -- snapshot (замер) | calc (расчёт) | legacy (из старой таблицы)
  follows bigint,                   -- подписались за день
  unfollows bigint,                 -- отписались за день
  reach bigint,
  views bigint,
  profile_views bigint,
  accounts_engaged bigint,
  total_interactions bigint,
  likes bigint,
  comments bigint,
  saves bigint,
  shares bigint,
  replies bigint,
  reposts bigint,
  website_clicks bigint,
  profile_links_taps bigint,
  updated_at timestamptz default now(),
  primary key (account_id, date)
);

-- 3. Посты: новые метрики и постоянная ссылка на обложку
alter table posts add column if not exists media_product_type text;
alter table posts add column if not exists thumb_url text;
alter table posts add column if not exists views bigint;
alter table posts add column if not exists total_interactions bigint;
alter table posts add column if not exists profile_visits bigint;
alter table posts add column if not exists follows bigint;
alter table posts add column if not exists reposts bigint;
alter table posts add column if not exists avg_watch_time_ms bigint;
alter table posts add column if not exists total_watch_time_ms bigint;
alter table posts add column if not exists insights_updated_at timestamptz;

-- 4. Ежедневные снимки метрик поста (динамика публикации)
create table if not exists post_daily (
  post_id text not null references posts(id) on delete cascade,
  date date not null,
  account_id text not null,
  likes bigint,
  comments bigint,
  saved bigint,
  shares bigint,
  reach bigint,
  views bigint,
  total_interactions bigint,
  captured_at timestamptz default now(),
  primary key (post_id, date)
);

-- 5. Stories: новые метрики
alter table stories add column if not exists media_type text;
alter table stories add column if not exists permalink text;
alter table stories add column if not exists thumb_url text;
alter table stories add column if not exists views bigint;
alter table stories add column if not exists shares bigint;
alter table stories add column if not exists total_interactions bigint;
alter table stories add column if not exists follows bigint;
alter table stories add column if not exists profile_visits bigint;
alter table stories add column if not exists taps_forward bigint;
alter table stories add column if not exists taps_back bigint;
alter table stories add column if not exists swipe_forward bigint;
alter table stories add column if not exists insights_ok boolean;
alter table stories add column if not exists updated_at timestamptz;

-- Версия 1.0 не смогла прочитать метрики Stories (Instagram отключил метрику exits),
-- поэтому у старых записей нули. Помечаем их, чтобы сайт писал «нет данных», а не 0.
update stories set insights_ok = false
where insights_ok is null and coalesce(reach, 0) = 0 and coalesce(replies, 0) = 0;

-- 6. Аудитория подписчиков (возраст, пол, города, страны)
create table if not exists account_audience (
  account_id text not null references accounts(id) on delete cascade,
  date date not null,
  age jsonb,
  gender jsonb,
  city jsonb,
  country jsonb,
  primary key (account_id, date)
);

-- 7. Журнал сборов статистики
create table if not exists sync_runs (
  id bigint generated always as identity primary key,
  source text not null,             -- cron | manual
  started_at timestamptz default now(),
  finished_at timestamptz,
  ok boolean,
  log jsonb
);

create index if not exists idx_account_daily_date on account_daily(date);
create index if not exists idx_post_daily_account on post_daily(account_id, date);
create index if not exists idx_sync_runs_started on sync_runs(started_at desc);

-- 8. Переносим замеры подписчиков из старой таблицы.
-- Старый сборщик работал в 06:18 UTC, это конец предыдущих суток Instagram, поэтому date - 1.
-- До 23.09.2026 старый сборщик писал нули, их не переносим.
insert into account_daily (account_id, date, followers, followers_source)
select account_id, date - 1, follower_count, 'legacy'
from daily_account_stats
where follower_count > 0
on conflict (account_id, date) do nothing;

-- 9. Хранилище обложек постов, Stories и аватарок (ссылки Instagram живут несколько дней)
insert into storage.buckets (id, name, public)
values ('ig-media', 'ig-media', true)
on conflict (id) do nothing;

-- 10. Закрываем таблицы от публичного (anon) ключа Supabase.
-- Сайт работает через service_role ключ, на него эти правила не действуют.
alter table accounts enable row level security;
alter table daily_account_stats enable row level security;
alter table account_daily enable row level security;
alter table posts enable row level security;
alter table post_daily enable row level security;
alter table stories enable row level security;
alter table account_audience enable row level security;
alter table sync_runs enable row level security;
