// Показатели Telegram-каналов. Определения как в TGStat:
// ERR   = просмотры поста / подписчики × 100%
// ERR24 = просмотры за первые 24 часа / подписчики × 100%
// ER    = (реакции + репосты + комментарии) / просмотры × 100%

import { addDays, dateRange, LOCAL_TZ } from "./dates";
import { postDate } from "./metrics";
import type { TgChannel, TgDaily, TgPost } from "./types";

export const TG_MEDIA_LABEL: Record<string, string> = {
  text: "Текст",
  photo: "Фото",
  album: "Альбом",
  video: "Видео",
  audio: "Аудио",
  file: "Файл",
  poll: "Опрос",
  other: "Другое",
};

export function tgPostLink(ch: Pick<TgChannel, "username"> | undefined | null, p: Pick<TgPost, "msg_id">) {
  return ch?.username ? `https://t.me/${ch.username}/${p.msg_id}` : null;
}

export function tgEngagement(p: TgPost) {
  return (p.reactions || 0) + (p.forwards || 0) + (p.comments || 0);
}

export function tgPostEr(p: TgPost): number | null {
  return p.views && p.views > 0 ? (tgEngagement(p) / p.views) * 100 : null;
}

export function tgPostErr(p: TgPost, subscribers: number | null | undefined): number | null {
  return p.views != null && subscribers && subscribers > 0 ? (p.views / subscribers) * 100 : null;
}

// Подписчики на дату: последний известный замер не позже неё
export function tgSubsOn(rows: TgDaily[], date: string): number | null {
  let best: TgDaily | null = null;
  for (const r of rows) {
    if (r.subscribers == null || r.date > date) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best?.subscribers ?? null;
}

function avg(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function sumOrNull(rows: TgDaily[], key: "joined" | "left_count" | "views" | "shares"): number | null {
  const nums = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

export type TgSummaryCalc = {
  subsStart: number | null;
  subsEnd: number | null;
  subsDelta: number | null;
  joined: number | null;
  left: number | null;
  posts: number;
  postsPerDay: number | null;
  viewsAvg: number | null;
  views24Avg: number | null;
  err: number | null;
  err24: number | null;
  er: number | null;
  reactions: number;
  forwards: number | null; // null: режим без ключей, Telegram не показывает репосты
  comments: number | null;
  dailyViews: number | null; // встроенная статистика своего канала
};

function sumKnown(posts: TgPost[], key: "forwards" | "comments"): number | null {
  const known = posts.filter((p) => p[key] != null);
  return known.length ? known.reduce((a, p) => a + (p[key] || 0), 0) : null;
}

export function periodPosts(posts: TgPost[], from: string, to: string) {
  return posts.filter((p) => {
    const d = postDate(p);
    return d >= from && d <= to;
  });
}

export function summarizeTg(rows: TgDaily[], posts: TgPost[], from: string, to: string, current?: number | null): TgSummaryCalc {
  const period = rows.filter((r) => r.date >= from && r.date <= to);
  const ps = periodPosts(posts, from, to);
  let subsStart = tgSubsOn(rows, addDays(from, -1));
  if (subsStart == null) subsStart = period.find((r) => r.subscribers != null)?.subscribers ?? null;
  const subsEnd = tgSubsOn(rows, to) ?? current ?? null;
  const subsFor = (p: TgPost) => tgSubsOn(rows, postDate(p)) ?? subsEnd;
  const days = dateRange(from, to).length;
  return {
    subsStart,
    subsEnd,
    subsDelta: subsStart != null && subsEnd != null ? subsEnd - subsStart : null,
    joined: sumOrNull(period, "joined"),
    left: sumOrNull(period, "left_count"),
    posts: ps.length,
    postsPerDay: days ? ps.length / days : null,
    viewsAvg: avg(ps.map((p) => p.views)),
    views24Avg: avg(ps.map((p) => p.views_24h)),
    err: avg(ps.map((p) => tgPostErr(p, subsFor(p)))),
    err24: avg(ps.map((p) => (p.views_24h != null ? tgPostErr({ ...p, views: p.views_24h }, subsFor(p)) : null))),
    er: avg(ps.map(tgPostEr)),
    reactions: ps.reduce((a, p) => a + (p.reactions || 0), 0),
    forwards: sumKnown(ps, "forwards"),
    comments: sumKnown(ps, "comments"),
    dailyViews: sumOrNull(period, "views"),
  };
}

// Сумма просмотров постов по дню их публикации (для чужих каналов, у которых нет встроенной статистики)
export function viewsByPublishDay(posts: TgPost[], from: string, to: string) {
  const by = new Map<string, number>();
  for (const p of periodPosts(posts, from, to)) by.set(postDate(p), (by.get(postDate(p)) || 0) + (p.views || 0));
  return dateRange(from, to).map((date) => ({ date, postViews: by.has(date) ? by.get(date)! : null }));
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOUR_BLOCKS = ["0–3", "3–6", "6–9", "9–12", "12–15", "15–18", "18–21", "21–24"];

export type TgSlot = { label: string; count: number; viewsAvg: number | null };

// Средние просмотры постов по дню недели и времени выхода (по Москве)
export function tgBestTime(posts: TgPost[]): { byWeekday: TgSlot[]; byHour: TgSlot[] } {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: LOCAL_TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" });
  const idx: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const wd: TgPost[][] = WEEKDAYS.map(() => []);
  const hr: TgPost[][] = HOUR_BLOCKS.map(() => []);
  for (const p of posts) {
    const parts = fmt.formatToParts(new Date(p.posted_at));
    const d = idx[parts.find((x) => x.type === "weekday")?.value || ""];
    const h = Number(parts.find((x) => x.type === "hour")?.value);
    if (d != null) wd[d].push(p);
    if (Number.isFinite(h)) hr[Math.floor(h / 3)].push(p);
  }
  const slot = (label: string, list: TgPost[]): TgSlot => ({ label, count: list.length, viewsAvg: avg(list.map((p) => p.views)) });
  return { byWeekday: WEEKDAYS.map((l, i) => slot(l, wd[i])), byHour: HOUR_BLOCKS.map((l, i) => slot(l, hr[i])) };
}

export function tgSeries(rows: TgDaily[], from: string, to: string) {
  const by = new Map(rows.map((r) => [r.date, r]));
  return dateRange(from, to).map((date) => {
    const r = by.get(date);
    return {
      date,
      subscribers: tgSubsOn(rows, date),
      // ключи как у Instagram, чтобы использовать тот же график подписок и отписок
      follows: r?.joined ?? null,
      unfollowsNeg: r?.left_count != null ? -r.left_count : null,
      views: r?.views ?? null,
      shares: r?.shares ?? null,
    };
  });
}
