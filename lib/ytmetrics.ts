// Показатели YouTube.
// ER        = (лайки + комментарии) / просмотры × 100%
// View rate = просмотры видео / подписчики × 100%
// Средняя длительность и процент досмотра за период взвешиваются по просмотрам.

import { addDays, dateInTz, dateRange, LOCAL_TZ } from "./dates";
import type { YtDaily, YtVideo } from "./types";

// Дата выхода видео по Москве
export function videoDate(v: Pick<YtVideo, "published_at">) {
  return dateInTz(new Date(v.published_at), LOCAL_TZ);
}

export function ytVideoLink(v: Pick<YtVideo, "id" | "is_short">) {
  return v.is_short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
}

export function ytKindLabel(v: Pick<YtVideo, "is_short">) {
  return v.is_short ? "Shorts" : "Видео";
}

export function ytEr(v: YtVideo): number | null {
  return v.views && v.views > 0 ? (((v.likes || 0) + (v.comments || 0)) / v.views) * 100 : null;
}

export function ytViewRate(v: YtVideo, subs: number | null | undefined): number | null {
  return v.views != null && subs && subs > 0 ? (v.views / subs) * 100 : null;
}

export function ytSubsOn(rows: YtDaily[], date: string): number | null {
  let best: YtDaily | null = null;
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

function sum(rows: YtDaily[], key: keyof YtDaily): number | null {
  const nums = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  return nums.length ? nums.reduce((a, b) => a + Number(b), 0) : null;
}

// Среднее, взвешенное по весу (по просмотрам или показам)
function weighted(rows: YtDaily[], key: keyof YtDaily, weight: keyof YtDaily): number | null {
  let s = 0;
  let w = 0;
  for (const r of rows) {
    const v = r[key];
    const k = r[weight];
    if (typeof v === "number" && typeof k === "number" && k > 0) {
      s += Number(v) * Number(k);
      w += Number(k);
    }
  }
  return w ? s / w : null;
}

export function periodVideos(videos: YtVideo[], from: string, to: string) {
  return videos.filter((v) => {
    const d = videoDate(v);
    return d >= from && d <= to;
  });
}

export type YtSummary = {
  subsStart: number | null;
  subsEnd: number | null;
  subsDelta: number | null;
  subsGained: number | null;
  subsLost: number | null;
  views: number | null; // аналитика: просмотры канала за период
  viewsByCounter: number | null; // замеры: прирост счётчика просмотров канала (работает и для конкурентов)
  watchHours: number | null;
  avgViewDuration: number | null;
  avgViewPercentage: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
  ctr: number | null;
  videos: number;
  shorts: number;
  long: number;
  videoViewsAvg: number | null;
  views24Avg: number | null;
  views7dAvg: number | null;
  er: number | null;
  viewRate: number | null;
};

export function summarizeYt(rows: YtDaily[], videos: YtVideo[], from: string, to: string, current?: number | null): YtSummary {
  const period = rows.filter((r) => r.date >= from && r.date <= to);
  const vs = periodVideos(videos, from, to);
  let subsStart = ytSubsOn(rows, addDays(from, -1));
  if (subsStart == null) subsStart = period.find((r) => r.subscribers != null)?.subscribers ?? null;
  const subsEnd = ytSubsOn(rows, to) ?? current ?? null;
  const counters = rows.filter((r) => r.views_total != null);
  const counterStart = counters.filter((r) => r.date < from).pop() ?? counters.find((r) => r.date >= from && r.date <= to);
  const counterEnd = [...counters].reverse().find((r) => r.date <= to);
  const subsFor = (v: YtVideo) => ytSubsOn(rows, videoDate(v)) ?? subsEnd;
  const watch = sum(period, "watch_minutes");
  return {
    subsStart,
    subsEnd,
    subsDelta: subsStart != null && subsEnd != null ? subsEnd - subsStart : null,
    subsGained: sum(period, "subs_gained"),
    subsLost: sum(period, "subs_lost"),
    views: sum(period, "views"),
    viewsByCounter:
      counterStart && counterEnd && counterEnd.date > counterStart.date ? Number(counterEnd.views_total) - Number(counterStart.views_total) : null,
    watchHours: watch != null ? watch / 60 : null,
    avgViewDuration: weighted(period, "avg_view_duration", "views"),
    avgViewPercentage: weighted(period, "avg_view_percentage", "views"),
    likes: sum(period, "likes"),
    comments: sum(period, "comments"),
    shares: sum(period, "shares"),
    impressions: sum(period, "impressions"),
    ctr: weighted(period, "impressions_ctr", "impressions"),
    videos: vs.length,
    shorts: vs.filter((v) => v.is_short).length,
    long: vs.filter((v) => !v.is_short).length,
    videoViewsAvg: avg(vs.map((v) => v.views)),
    views24Avg: avg(vs.map((v) => v.views_24h)),
    views7dAvg: avg(vs.map((v) => v.views_7d)),
    er: avg(vs.map(ytEr)),
    viewRate: avg(vs.map((v) => ytViewRate(v, subsFor(v)))),
  };
}

export function ytSeries(rows: YtDaily[], videos: YtVideo[], from: string, to: string) {
  const by = new Map(rows.map((r) => [r.date, r]));
  const pub = new Map<string, number>();
  for (const v of periodVideos(videos, from, to)) pub.set(videoDate(v), (pub.get(videoDate(v)) || 0) + (v.views || 0));
  return dateRange(from, to).map((date) => {
    const r = by.get(date);
    return {
      date,
      subscribers: r?.subscribers ?? null,
      // ключи как у Instagram, чтобы использовать тот же график подписок и отписок
      follows: r?.subs_gained ?? null,
      unfollowsNeg: r?.subs_lost != null ? -r.subs_lost : null,
      views: r?.views ?? null,
      watchHours: r?.watch_minutes != null ? Math.round((r.watch_minutes / 60) * 10) / 10 : null,
      impressions: r?.impressions ?? null,
      ctr: r?.impressions_ctr != null ? Math.round(Number(r.impressions_ctr) * 100) / 100 : null,
      postViews: pub.has(date) ? pub.get(date)! : null,
    };
  });
}

export type YtTypeStats = { label: string; count: number; viewsAvg: number | null; erAvg: number | null; durationAvg: number | null; retentionAvg: number | null };

export function statsByType(videos: YtVideo[]): YtTypeStats[] {
  return [
    { label: "Видео", list: videos.filter((v) => !v.is_short) },
    { label: "Shorts", list: videos.filter((v) => v.is_short) },
  ]
    .filter((g) => g.list.length)
    .map((g) => ({
      label: g.label,
      count: g.list.length,
      viewsAvg: avg(g.list.map((v) => v.views)),
      erAvg: avg(g.list.map(ytEr)),
      durationAvg: avg(g.list.map((v) => v.duration_sec)),
      retentionAvg: avg(g.list.map((v) => (v.avg_view_percentage != null ? Number(v.avg_view_percentage) : null))),
    }));
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOUR_BLOCKS = ["0–3", "3–6", "6–9", "9–12", "12–15", "15–18", "18–21", "21–24"];

export function ytBestTime(videos: YtVideo[]) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: LOCAL_TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" });
  const idx: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const wd: YtVideo[][] = WEEKDAYS.map(() => []);
  const hr: YtVideo[][] = HOUR_BLOCKS.map(() => []);
  for (const v of videos) {
    const parts = fmt.formatToParts(new Date(v.published_at));
    const d = idx[parts.find((x) => x.type === "weekday")?.value || ""];
    const h = Number(parts.find((x) => x.type === "hour")?.value);
    if (d != null) wd[d].push(v);
    if (Number.isFinite(h)) hr[Math.floor(h / 3)].push(v);
  }
  const slot = (label: string, list: YtVideo[]) => ({ label, count: list.length, viewsAvg: avg(list.map((v) => v.views)) });
  return { byWeekday: WEEKDAYS.map((l, i) => slot(l, wd[i])), byHour: HOUR_BLOCKS.map((l, i) => slot(l, hr[i])) };
}

// 754 -> "12:34"
export function fmtClock(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
