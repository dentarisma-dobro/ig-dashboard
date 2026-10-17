// Обёртка над Instagram Graph API.
//
// Названия метрик проверены на живом API в октябре 2026 (Graph API v24).
// Meta периодически отключает метрики: impressions, plays и exits уже не работают.
// Если Instagram отклоняет метрику, запрос автоматически повторяется по одной метрике,
// и отклонённая просто пропускается, остальная статистика сохраняется.

import { metaDayWindow } from "./dates";

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.code = code;
    this.subcode = subcode;
  }
}

function getToken(): string {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) throw new Error("Не задана переменная окружения IG_ACCESS_TOKEN");
  return token;
}

// Коды временных ошибок Meta: перегрузка, лимиты запросов
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

async function graphGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", getToken());

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(25000) });
    } catch (e: any) {
      if (attempt < 2) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new GraphError(`Нет связи с Instagram (${path}): ${e?.message || e}`);
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error) return data;

    const err = data.error || {};
    const transient = res.status >= 500 || TRANSIENT_CODES.has(err.code);
    if (transient && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    throw new GraphError(err.message || `HTTP ${res.status}`, err.code, err.error_subcode);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isMetricNameError(e: unknown) {
  return e instanceof GraphError && e.code === 100 && /metric/i.test(e.message);
}

function readValue(item: any): number | null {
  const v = item?.total_value?.value ?? item?.values?.[0]?.value;
  return typeof v === "number" ? v : null;
}

// Запрашивает набор метрик. Если Instagram отклонил какую-то метрику по названию,
// повторяет запрос по одной и возвращает то, что удалось получить.
async function insightsSafe(
  path: string,
  metrics: string[],
  params: Record<string, string> = {}
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  try {
    const data = await graphGet(path, { ...params, metric: metrics.join(",") });
    for (const item of data.data || []) out[item.name] = readValue(item);
    return out;
  } catch (e) {
    if (!isMetricNameError(e) || metrics.length === 1) throw e;
  }
  await Promise.all(
    metrics.map(async (m) => {
      try {
        const data = await graphGet(path, { ...params, metric: m });
        out[m] = readValue(data.data?.[0]);
      } catch (e) {
        if (!isMetricNameError(e)) throw e;
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------------------
// Профиль и список аккаунтов
// ---------------------------------------------------------------------------

export type IgProfile = {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
};

export async function fetchProfile(id: string): Promise<IgProfile> {
  return graphGet(`/${id}`, {
    fields:
      "id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url",
  });
}

// Instagram-аккаунты, к которым у токена есть доступ (через Facebook-страницы)
export async function fetchAvailableAccounts(): Promise<
  { id: string; username: string; name?: string; profile_picture_url?: string; followers_count?: number; page_id: string; page_name: string }[]
> {
  const out = [];
  let after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const params: Record<string, string> = {
      fields:
        "id,name,instagram_business_account{id,username,name,profile_picture_url,followers_count}",
      limit: "100",
    };
    if (after) params.after = after;
    const data = await graphGet("/me/accounts", params);
    for (const page of data.data || []) {
      const ig = page.instagram_business_account;
      if (ig) out.push({ ...ig, page_id: page.id, page_name: page.name });
    }
    after = data.paging?.next ? data.paging?.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Дневная статистика аккаунта
// ---------------------------------------------------------------------------

export const DAY_METRICS = [
  "reach",
  "views",
  "profile_views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "saves",
  "shares",
  "replies",
  "reposts",
  "website_clicks",
  "profile_links_taps",
] as const;

export type DayTotals = Partial<Record<(typeof DAY_METRICS)[number], number | null>> & {
  follows?: number | null;
  unfollows?: number | null;
};

// Метрики за одни сутки Instagram (date в формате YYYY-MM-DD)
export async function fetchDayTotals(accountId: string, date: string): Promise<DayTotals> {
  const { since, until } = metaDayWindow(date);
  const window = { period: "day", metric_type: "total_value", since: String(since), until: String(until) };

  const [totals, follows] = await Promise.all([
    insightsSafe(`/${accountId}/insights`, [...DAY_METRICS], window),
    graphGet(`/${accountId}/insights`, {
      ...window,
      metric: "follows_and_unfollows",
      breakdown: "follow_type",
    }).catch(() => null),
  ]);

  const result: DayTotals = { ...totals };
  // FOLLOWER = подписались, NON_FOLLOWER = отписались (сверено с изменением followers_count)
  const breakdown = follows?.data?.[0]?.total_value?.breakdowns?.[0]?.results;
  if (Array.isArray(breakdown)) {
    const get = (key: string) =>
      breakdown.find((r: any) => r.dimension_values?.[0] === key)?.value ?? 0;
    result.follows = get("FOLLOWER");
    result.unfollows = get("NON_FOLLOWER");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Аудитория
// ---------------------------------------------------------------------------

export type Audience = {
  age: Record<string, number> | null;
  gender: Record<string, number> | null;
  city: Record<string, number> | null;
  country: Record<string, number> | null;
};

// Демография подписчиков. Instagram отдаёт её только аккаунтам от 100 подписчиков.
export async function fetchAudience(accountId: string): Promise<Audience> {
  const one = async (breakdown: string) => {
    try {
      const data = await graphGet(`/${accountId}/insights`, {
        metric: "follower_demographics",
        period: "lifetime",
        metric_type: "total_value",
        breakdown,
      });
      const results = data.data?.[0]?.total_value?.breakdowns?.[0]?.results;
      if (!Array.isArray(results) || results.length === 0) return null;
      const out: Record<string, number> = {};
      for (const r of results) out[r.dimension_values?.[0]] = r.value;
      return out;
    } catch {
      return null;
    }
  };
  const [age, gender, city, country] = await Promise.all([
    one("age"),
    one("gender"),
    one("city"),
    one("country"),
  ]);
  return { age, gender, city, country };
}

// ---------------------------------------------------------------------------
// Публикации
// ---------------------------------------------------------------------------

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}";

export type IgMedia = {
  id: string;
  caption?: string;
  media_type: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type?: string; // FEED | REELS | STORY | AD
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] };
};

export async function fetchMediaPage(
  accountId: string,
  after?: string,
  limit = 50
): Promise<{ items: IgMedia[]; nextCursor: string | null }> {
  const params: Record<string, string> = { fields: MEDIA_FIELDS, limit: String(limit) };
  if (after) params.after = after;
  const data = await graphGet(`/${accountId}/media`, params);
  return {
    items: data.data || [],
    nextCursor: data.paging?.next && data.paging?.cursors?.after ? data.paging.cursors.after : null,
  };
}

// Картинка для обложки: у видео это превью, у карусели первый слайд
export function coverUrl(m: IgMedia): string | null {
  if (m.thumbnail_url) return m.thumbnail_url;
  if (m.media_type !== "VIDEO" && m.media_url) return m.media_url;
  const first = m.children?.data?.[0];
  if (first) return first.thumbnail_url || (first.media_type !== "VIDEO" ? first.media_url || null : null);
  return null;
}

const FEED_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows", "reposts"];
const REELS_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "reposts", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];

export async function fetchMediaInsights(m: IgMedia): Promise<{ ok: boolean; values: Record<string, number | null> }> {
  const metrics = m.media_product_type === "REELS" ? REELS_METRICS : FEED_METRICS;
  try {
    return { ok: true, values: await insightsSafe(`/${m.id}/insights`, metrics) };
  } catch {
    // Посты, опубликованные до перехода на бизнес-аккаунт, статистику не отдают
    return { ok: false, values: {} };
  }
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export async function fetchActiveStories(accountId: string): Promise<IgMedia[]> {
  const data = await graphGet(`/${accountId}/stories`, {
    fields: "id,timestamp,media_type,media_product_type,media_url,thumbnail_url,permalink",
  });
  return data.data || [];
}

const STORY_METRICS = ["reach", "views", "replies", "shares", "total_interactions", "follows", "profile_visits"];

export async function fetchStoryInsights(storyId: string): Promise<{ ok: boolean; values: Record<string, number | null> }> {
  try {
    const [values, nav] = await Promise.all([
      insightsSafe(`/${storyId}/insights`, STORY_METRICS),
      graphGet(`/${storyId}/insights`, {
        metric: "navigation",
        breakdown: "story_navigation_action_type",
      }).catch(() => null),
    ]);
    const results = nav?.data?.[0]?.total_value?.breakdowns?.[0]?.results;
    if (Array.isArray(results)) {
      const get = (key: string) =>
        results.find((r: any) => String(r.dimension_values?.[0]).toLowerCase() === key)?.value ?? 0;
      values.taps_forward = get("tap_forward");
      values.taps_back = get("tap_back");
      values.exits = get("tap_exit");
      values.swipe_forward = get("swipe_forward");
    }
    return { ok: true, values };
  } catch {
    return { ok: false, values: {} };
  }
}
