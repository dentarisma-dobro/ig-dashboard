-- Исходная схема (уже выполнена вами ранее — этот файл не нужно
-- запускать повторно, если сайт уже работает). Оставлен для справки
-- и на случай развёртывания на новом Supabase-проекте с нуля.
-- Для добавления новых функций (реклама, конкуренты, коммуникация)
-- используйте migration_2.sql.

create table if not exists accounts (
  id text primary key,
  username text not null,
  display_name text not null,
  page_id text not null,
  created_at timestamptz default now()
);

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
  id text primary key,
  account_id text references accounts(id) not null,
  media_type text,
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

create table if not exists stories (
  id text primary key,
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
