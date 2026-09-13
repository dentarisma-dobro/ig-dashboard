-- Схема базы данных для дашборда статистики Instagram
-- Выполните этот файл целиком в Supabase: SQL Editor -> New query -> вставить -> Run

create table if not exists accounts (
  id text primary key,              -- Instagram Business Account ID
  username text not null,           -- @username
  display_name text not null,       -- "Dentarisma", "Dentarisma Dobro", "Alex Kozlov"
  page_id text not null,            -- ID связанной Facebook-страницы
  created_at timestamptz default now()
);

-- Ежедневные срезы по аккаунту (охват, показы, подписчики)
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

-- Посты и их метрики (обновляются при каждом сборе, поэтому не unique по дню)
create table if not exists posts (
  id text primary key,              -- Instagram media ID
  account_id text references accounts(id) not null,
  media_type text,                  -- IMAGE, VIDEO, CAROUSEL_ALBUM
  caption text,
  permalink text,
  thumbnail_url text,
  posted_at timestamptz,
  likes bigint default 0,
  comments bigint default 0,
  saved bigint default 0,
  shares bigint default 0,
  reach bigint default 0,
  updated_at timestamptz default now()
);

-- Stories (короткоживущие, поэтому сохраняем снимок метрик на момент сбора)
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
