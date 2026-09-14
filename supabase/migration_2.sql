-- Миграция №2: новые метрики, реклама, конкуренты.
-- Выполните в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Безопасно для уже собранных данных — ничего не удаляет и не перезаписывает.

alter table daily_account_stats add column if not exists website_clicks bigint default 0;
alter table daily_account_stats add column if not exists phone_call_clicks bigint default 0;
alter table daily_account_stats add column if not exists text_message_clicks bigint default 0;
alter table daily_account_stats add column if not exists email_contacts bigint default 0;
alter table daily_account_stats add column if not exists get_directions_clicks bigint default 0;

-- Метки рекламных кампаний, вносятся вручную на сайте
create table if not exists ad_campaigns (
  id bigint generated always as identity primary key,
  account_id text references accounts(id) not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  budget numeric,
  result_note text,
  created_at timestamptz default now()
);

-- Конкуренты — ручной трекинг (Instagram API не даёт данные по чужим аккаунтам)
create table if not exists competitors (
  id bigint generated always as identity primary key,
  name text not null,
  username text,
  notes text,
  created_at timestamptz default now()
);

-- Снимки показателей конкурента на определённую дату — вносятся вручную
create table if not exists competitor_snapshots (
  id bigint generated always as identity primary key,
  competitor_id bigint references competitors(id) on delete cascade not null,
  date date not null,
  followers bigint,
  top_post_url text,
  top_post_note text,
  created_at timestamptz default now()
);

create index if not exists idx_ads_account on ad_campaigns(account_id, start_date);
create index if not exists idx_competitor_snapshots on competitor_snapshots(competitor_id, date desc);
