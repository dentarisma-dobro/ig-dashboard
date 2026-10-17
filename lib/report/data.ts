// Данные для отчёта: собираются в браузере из тех же API, что и дашборд.

import type { Account, AudienceRow, DailyRow, Post, Story } from "../types";
import {
  followersOn,
  interactions,
  postDate,
  postEr,
  postErr,
  postKind,
  statsByKind,
  summarize,
  type KindStats,
  type PostKind,
  type Summary,
} from "../metrics";
import { dateRange } from "../dates";

export type ReportPost = Post & { kind: PostKind; err: number | null; er: number | null; inter: number };

export type DayPoint = {
  date: string;
  followers: number | null;
  follows: number | null;
  unfollows: number | null;
  reach: number | null;
  views: number | null;
  profile_views: number | null;
  total_interactions: number | null;
  website_clicks: number | null;
};

export type AccountReport = {
  account: Account;
  cur: Summary;
  prev: Summary;
  days: DayPoint[];
  posts: ReportPost[]; // публикации периода, новые сверху
  kinds: KindStats[];
  stories: Story[];
  audience: AudienceRow | null;
};

export type ReportData = {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  generatedAt: string;
  accounts: AccountReport[];
};

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Ошибка ${res.status}`);
  return body as T;
}

export async function loadReportData(accounts: Account[], from: string, to: string): Promise<ReportData> {
  let prevFrom = from;
  let prevTo = from;
  const parts = await Promise.all(
    accounts.map(async (account): Promise<AccountReport> => {
      const q = `account=${account.id}&from=${from}&to=${to}`;
      const [stats, posts, stories, audience] = await Promise.all([
        get<{ rows: DailyRow[]; prevFrom: string; prevTo: string }>(`/api/stats?${q}`),
        get<{ posts: Post[] }>(`/api/posts?${q}`),
        get<{ stories: Story[] }>(`/api/stories?${q}`),
        get<{ audience: AudienceRow | null }>(`/api/audience?account=${account.id}`).catch(() => ({ audience: null })),
      ]);
      prevFrom = stats.prevFrom;
      prevTo = stats.prevTo;
      const rows = stats.rows;
      const byDate = new Map(rows.map((r) => [r.date, r]));
      const days: DayPoint[] = dateRange(from, to).map((date) => {
        const r = byDate.get(date);
        return {
          date,
          followers: followersOn(rows, date),
          follows: r?.follows ?? null,
          unfollows: r?.unfollows ?? null,
          reach: r?.reach ?? null,
          views: r?.views ?? null,
          profile_views: r?.profile_views ?? null,
          total_interactions: r?.total_interactions ?? null,
          website_clicks: r?.website_clicks ?? null,
        };
      });
      const periodPosts = posts.posts
        .filter((p) => {
          const d = postDate(p);
          return d >= from && d <= to;
        })
        .map((p) => ({
          ...p,
          kind: postKind(p),
          err: postErr(p),
          er: postEr(p, followersOn(rows, postDate(p)) ?? account.followers_count),
          inter: interactions(p),
        }));
      return {
        account,
        cur: summarize(rows, posts.posts, from, to, account.followers_count),
        prev: summarize(rows, posts.posts, stats.prevFrom, stats.prevTo, account.followers_count),
        days,
        posts: periodPosts,
        kinds: statsByKind(periodPosts),
        stories: stories.stories,
        audience: audience.audience,
      };
    })
  );
  return { from, to, prevFrom, prevTo, generatedAt: new Date().toISOString(), accounts: parts };
}
