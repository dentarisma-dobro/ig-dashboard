// Расчёт показателей для дашборда и отчётов. Работает и в браузере, и на сервере.
//
// ER (вовлечённость по подписчикам) = (лайки + комментарии + сохранения + репосты) / подписчики × 100%
// ERR (вовлечённость по охвату)      = (лайки + комментарии + сохранения + репосты) / охват × 100%
// Так же считает LiveDune.

import { addDays, dateInTz, dateRange, LOCAL_TZ } from "./dates";
import type { DailyRow, Post } from "./types";

export type PostKind = "reels" | "carousel" | "photo" | "video";

export const KIND_LABEL: Record<PostKind, string> = {
  reels: "Reels",
  carousel: "Карусель",
  photo: "Фото",
  video: "Видео",
};

export function postKind(p: Pick<Post, "media_type" | "media_product_type">): PostKind {
  if (p.media_product_type === "REELS") return "reels";
  if (p.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (p.media_type === "VIDEO") return p.media_product_type === "FEED" ? "video" : "reels";
  return "photo";
}

export function interactions(p: Pick<Post, "likes" | "comments" | "saved" | "shares">): number {
  return (p.likes || 0) + (p.comments || 0) + (p.saved || 0) + (p.shares || 0);
}

export function postErr(p: Post): number | null {
  return p.reach && p.reach > 0 ? (interactions(p) / p.reach) * 100 : null;
}

export function postEr(p: Post, followers: number | null | undefined): number | null {
  return followers && followers > 0 ? (interactions(p) / followers) * 100 : null;
}

export function postDate(p: Pick<Post, "posted_at">): string {
  return dateInTz(new Date(p.posted_at), LOCAL_TZ);
}

// Подписчики на конец дня date: последний известный замер не позже этой даты
export function followersOn(rows: DailyRow[], date: string): number | null {
  let best: DailyRow | null = null;
  for (const r of rows) {
    if (r.followers == null || r.date > date) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best?.followers ?? null;
}

function sum(rows: DailyRow[], key: keyof DailyRow): number | null {
  let total = 0;
  let any = false;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number") {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

function avg(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export type Summary = {
  followersStart: number | null;
  followersEnd: number | null;
  followersDelta: number | null;
  follows: number | null;
  unfollows: number | null;
  reachAvg: number | null;
  viewsSum: number | null;
  profileViewsSum: number | null;
  websiteClicksSum: number | null;
  interactionsSum: number | null;
  daysWithData: number;
  posts: number;
  postsReachAvg: number | null;
  postsViewsAvg: number | null;
  er: number | null;
  err: number | null;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
};

// Сводка по одному аккаунту за период [from, to].
// rows и posts могут содержать и другие даты: функция сама отфильтрует нужное.
export function summarize(
  rows: DailyRow[],
  posts: Post[],
  from: string,
  to: string,
  currentFollowers?: number | null
): Summary {
  const period = rows.filter((r) => r.date >= from && r.date <= to);
  const withData = period.filter((r) => r.reach != null || r.views != null);

  const followersEnd = followersOn(rows, to);
  let followersStart = followersOn(rows, addDays(from, -1));
  if (followersStart == null) {
    const first = period.find((r) => r.followers != null);
    followersStart = first?.followers ?? null;
  }

  const periodPosts = posts.filter((p) => {
    const d = postDate(p);
    return d >= from && d <= to;
  });
  const followersFor = (p: Post) => followersOn(rows, postDate(p)) ?? currentFollowers ?? null;

  return {
    followersStart,
    followersEnd,
    followersDelta: followersStart != null && followersEnd != null ? followersEnd - followersStart : null,
    follows: sum(period, "follows"),
    unfollows: sum(period, "unfollows"),
    reachAvg: avg(withData.map((r) => r.reach)),
    viewsSum: sum(period, "views"),
    profileViewsSum: sum(period, "profile_views"),
    websiteClicksSum: sum(period, "website_clicks"),
    interactionsSum: sum(period, "total_interactions"),
    daysWithData: withData.length,
    posts: periodPosts.length,
    postsReachAvg: avg(periodPosts.map((p) => p.reach)),
    postsViewsAvg: avg(periodPosts.map((p) => p.views)),
    er: avg(periodPosts.map((p) => postEr(p, followersFor(p)))),
    err: avg(periodPosts.map(postErr)),
    likes: periodPosts.reduce((a, p) => a + (p.likes || 0), 0),
    comments: periodPosts.reduce((a, p) => a + (p.comments || 0), 0),
    saves: periodPosts.reduce((a, p) => a + (p.saved || 0), 0),
    shares: periodPosts.reduce((a, p) => a + (p.shares || 0), 0),
  };
}

// Ряд по дням без пропусков: на дни без данных значения null
export function dailySeries<K extends keyof DailyRow>(
  rows: DailyRow[],
  from: string,
  to: string,
  keys: K[]
): ({ date: string } & Record<K, number | null>)[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dateRange(from, to).map((date) => {
    const r = byDate.get(date);
    const point: any = { date };
    for (const k of keys) point[k] = r ? (r[k] as number | null) : null;
    return point;
  });
}

export type KindStats = {
  kind: PostKind;
  count: number;
  reachAvg: number | null;
  viewsAvg: number | null;
  interactionsAvg: number | null;
  errAvg: number | null;
};

export function statsByKind(posts: Post[]): KindStats[] {
  const kinds: PostKind[] = ["reels", "carousel", "photo", "video"];
  return kinds
    .map((kind) => {
      const list = posts.filter((p) => postKind(p) === kind);
      return {
        kind,
        count: list.length,
        reachAvg: avg(list.map((p) => p.reach)),
        viewsAvg: avg(list.map((p) => p.views)),
        interactionsAvg: avg(list.map(interactions)),
        errAvg: avg(list.map(postErr)),
      };
    })
    .filter((k) => k.count > 0);
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOUR_BLOCKS = ["0–3", "3–6", "6–9", "9–12", "12–15", "15–18", "18–21", "21–24"];

export type TimeSlot = { label: string; count: number; errAvg: number | null; reachAvg: number | null };

// Лучшее время для публикаций: средний ERR и охват постов по дню недели и времени выхода
export function bestTime(posts: Post[]): { byWeekday: TimeSlot[]; byHour: TimeSlot[] } {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: LOCAL_TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" });
  const wdIndex: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const byWd: Post[][] = WEEKDAYS.map(() => []);
  const byH: Post[][] = HOUR_BLOCKS.map(() => []);
  for (const p of posts) {
    const parts = fmt.formatToParts(new Date(p.posted_at));
    const wd = wdIndex[parts.find((x) => x.type === "weekday")?.value || ""];
    const h = Number(parts.find((x) => x.type === "hour")?.value);
    if (wd != null) byWd[wd].push(p);
    if (Number.isFinite(h)) byH[Math.floor(h / 3)].push(p);
  }
  const slot = (label: string, list: Post[]): TimeSlot => ({
    label,
    count: list.length,
    errAvg: avg(list.map(postErr)),
    reachAvg: avg(list.map((p) => p.reach)),
  });
  return {
    byWeekday: WEEKDAYS.map((l, i) => slot(l, byWd[i])),
    byHour: HOUR_BLOCKS.map((l, i) => slot(l, byH[i])),
  };
}

// Сортировка словаря аудитории: [["25-34", 110], ...] по убыванию
export function topEntries(obj: Record<string, number> | null | undefined, limit = 10): [string, number][] {
  if (!obj) return [];
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
