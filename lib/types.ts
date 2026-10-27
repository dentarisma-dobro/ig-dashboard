export type Account = {
  id: string;
  username: string;
  display_name: string;
  name?: string | null;
  biography?: string | null;
  website?: string | null;
  avatar_url?: string | null;
  followers_count?: number | null;
  follows_count?: number | null;
  media_count?: number | null;
  is_active?: boolean;
  profile_updated_at?: string | null;
};

export type DailyRow = {
  account_id: string;
  date: string;
  followers: number | null;
  followers_source: string | null;
  follows: number | null;
  unfollows: number | null;
  reach: number | null;
  views: number | null;
  profile_views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  replies: number | null;
  reposts: number | null;
  website_clicks: number | null;
  profile_links_taps: number | null;
};

export type Post = {
  id: string;
  account_id: string;
  media_type: string | null;
  media_product_type: string | null;
  caption: string | null;
  permalink: string | null;
  thumb_url: string | null;
  posted_at: string;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  reach: number | null;
  views: number | null;
  total_interactions: number | null;
  profile_visits: number | null;
  follows: number | null;
  reposts: number | null;
  avg_watch_time_ms: number | null;
  total_watch_time_ms: number | null;
  insights_updated_at: string | null;
};

export type PostSnapshot = {
  date: string;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  reach: number | null;
  views: number | null;
  total_interactions: number | null;
};

export type Story = {
  id: string;
  account_id: string;
  posted_at: string;
  media_type: string | null;
  permalink: string | null;
  thumb_url: string | null;
  reach: number | null;
  views: number | null;
  replies: number | null;
  shares: number | null;
  total_interactions: number | null;
  follows: number | null;
  profile_visits: number | null;
  taps_forward: number | null;
  taps_back: number | null;
  exits: number | null;
  swipe_forward: number | null;
  insights_ok: boolean | null;
  captured_at: string | null;
};

export type AudienceRow = {
  account_id: string;
  date: string;
  age: Record<string, number> | null;
  gender: Record<string, number> | null;
  city: Record<string, number> | null;
  country: Record<string, number> | null;
};

export type SyncRun = {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  log?: string[] | null;
};

export type Range = { from: string; to: string; prevFrom: string; prevTo: string };

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

export type TgChannel = {
  id: string; // username в нижнем регистре
  tg_id: string | null;
  username: string | null;
  title: string;
  about: string | null;
  avatar_url: string | null;
  is_own: boolean;
  is_active: boolean;
  subscribers: number | null;
  stats_available: boolean | null;
  history_loaded: boolean;
  updated_at: string | null;
};

export type TgDaily = {
  channel_id: string;
  date: string;
  subscribers: number | null;
  subscribers_source: string | null;
  joined: number | null;
  left_count: number | null;
  views: number | null;
  shares: number | null;
};

export type TgPost = {
  channel_id: string;
  msg_id: number;
  posted_at: string;
  text: string | null;
  media_type: string | null;
  views: number | null;
  forwards: number | null;
  reactions: number | null;
  comments: number | null;
  views_24h: number | null;
};

export type TgGraph = { names: Record<string, string>; x: number[]; series: Record<string, number[]> };

export type TgStatsSummary = {
  period: { from: string; to: string };
  followers: { current: number; previous: number };
  viewsPerPost: { current: number; previous: number };
  sharesPerPost: { current: number; previous: number };
  reactionsPerPost: { current: number; previous: number };
  notificationsPercent: number | null;
  viewsBySource: { name: string; value: number }[];
  followersBySource: { name: string; value: number }[];
  languages: { name: string; value: number }[];
  topHours: TgGraph | null;
};

export type TgSession = {
  configured: boolean;
  connected: boolean;
  pending: string | null;
  userName: string | null;
  phone: string | null;
};
