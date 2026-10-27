// YouTube: публичные данные (YouTube Data API v3, ключ YT_API_KEY),
// аналитика своего канала (YouTube Analytics API) и показы/CTR обложек (YouTube Reporting API).
// Для аналитики владелец канала один раз входит Google-аккаунтом, сайт хранит refresh token.

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const REPORTING = "https://youtubereporting.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export function ytStatus() {
  return {
    apiKey: !!process.env.YT_API_KEY,
    oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };
}

export function googleSecret(): string {
  const s = process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error("Не задан GOOGLE_CLIENT_SECRET");
  return s;
}

const REASONS: Record<string, string> = {
  quotaExceeded: "Закончилась суточная квота YouTube API, сбор продолжится завтра",
  keyInvalid: "Неверный YT_API_KEY",
  accessNotConfigured: "В Google Cloud не включён нужный API (YouTube Data API v3, YouTube Analytics API или YouTube Reporting API)",
  forbidden: "Google запретил доступ: войдите заново аккаунтом владельца канала",
  channelNotFound: "Канал не найден",
  invalid_grant: "Вход Google истёк или отозван: подключите аналитику заново в настройках",
};

export class YtError extends Error {
  reason?: string;
  status?: number;
}

async function request(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(25000) });
  } catch (e: any) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return request(url, init, attempt + 1);
    }
    throw new YtError(`Нет связи с Google: ${e?.message || e}`);
  }
  if ((res.status >= 500 || res.status === 429) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return request(url, init, attempt + 1);
  }
  return res;
}

async function json(url: URL | string, token?: string, init: RequestInit = {}): Promise<any> {
  const u = new URL(url.toString());
  if (!token && u.hostname === "www.googleapis.com") {
    const key = process.env.YT_API_KEY;
    if (!key) throw new YtError("Не задан YT_API_KEY (ключ YouTube Data API v3 из Google Cloud)");
    u.searchParams.set("key", key);
  }
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await request(u.toString(), { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || body?.error;
    const err = new YtError(REASONS[reason] || body?.error?.message || body?.error_description || `Google ответил ${res.status}`);
    err.reason = typeof reason === "string" ? reason : undefined;
    err.status = res.status;
    throw err;
  }
  return body;
}

// ---------------------------------------------------------------------------
// Каналы и видео (Data API)
// ---------------------------------------------------------------------------

// "https://www.youtube.com/@name", "@name", "youtube.com/channel/UC…", "UC…"
export function parseYtRef(input: string): { id?: string; handle?: string; username?: string } {
  const s = input.trim();
  const id = s.match(/(UC[\w-]{22})/);
  if (id) return { id: id[1] };
  const handle = s.match(/@([\w.\-]{3,100})/);
  if (handle) return { handle: handle[1] };
  const user = s.match(/youtube\.com\/user\/([\w.\-]+)/i);
  if (user) return { username: user[1] };
  if (/^[\w.\-]{3,100}$/.test(s)) return { handle: s };
  throw new YtError("Не похоже на ссылку на канал. Пример: https://www.youtube.com/@dentarisma");
}

export type YtChannelInfo = {
  id: string;
  handle: string | null;
  title: string;
  description: string | null;
  avatar: string | null;
  uploads: string | null;
  publishedAt: string | null;
  subscribers: number | null;
  views: number | null;
  videos: number | null;
};

function channelFrom(item: any): YtChannelInfo {
  const st = item.statistics || {};
  return {
    id: item.id,
    handle: item.snippet?.customUrl ? String(item.snippet.customUrl).replace(/^@/, "") : null,
    title: item.snippet?.title || item.id,
    description: item.snippet?.description || null,
    avatar: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || null,
    uploads: item.contentDetails?.relatedPlaylists?.uploads || null,
    publishedAt: item.snippet?.publishedAt || null,
    subscribers: st.hiddenSubscriberCount ? null : st.subscriberCount != null ? Number(st.subscriberCount) : null,
    views: st.viewCount != null ? Number(st.viewCount) : null,
    videos: st.videoCount != null ? Number(st.videoCount) : null,
  };
}

export async function fetchChannel(ref: { id?: string; handle?: string; username?: string }, token?: string): Promise<YtChannelInfo> {
  const url = new URL(`${DATA}/channels`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  if (ref.id) url.searchParams.set("id", ref.id);
  else if (ref.handle) url.searchParams.set("forHandle", `@${ref.handle}`);
  else if (ref.username) url.searchParams.set("forUsername", ref.username);
  const body = await json(url, token);
  const item = body.items?.[0];
  if (!item) throw new YtError("Канал YouTube не найден. Проверьте ссылку");
  return channelFrom(item);
}

export async function fetchMyChannels(token: string): Promise<YtChannelInfo[]> {
  const url = new URL(`${DATA}/channels`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("mine", "true");
  const body = await json(url, token);
  return (body.items || []).map(channelFrom);
}

// Страница плейлиста загрузок: до 50 ID видео, от новых к старым
export async function fetchUploadsPage(playlistId: string, pageToken?: string | null, token?: string) {
  const url = new URL(`${DATA}/playlistItems`);
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const body = await json(url, token);
  return {
    ids: (body.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean) as string[],
    next: (body.nextPageToken as string) || null,
  };
}

export type YtVideoInfo = {
  id: string;
  publishedAt: string;
  title: string;
  description: string;
  durationSec: number | null;
  live: boolean;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

// "PT1H2M3S" -> 3723
export function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
}

export async function fetchVideos(ids: string[], token?: string): Promise<YtVideoInfo[]> {
  const out: YtVideoInfo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL(`${DATA}/videos`);
    url.searchParams.set("part", "snippet,statistics,contentDetails");
    url.searchParams.set("id", ids.slice(i, i + 50).join(","));
    url.searchParams.set("maxResults", "50");
    const body = await json(url, token);
    for (const v of body.items || []) {
      const st = v.statistics || {};
      out.push({
        id: v.id,
        publishedAt: v.snippet?.publishedAt,
        title: v.snippet?.title || "",
        description: v.snippet?.description || "",
        durationSec: parseDuration(v.contentDetails?.duration),
        live: !!v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none",
        views: st.viewCount != null ? Number(st.viewCount) : null,
        likes: st.likeCount != null ? Number(st.likeCount) : null,
        comments: st.commentCount != null ? Number(st.commentCount) : null,
      });
    }
  }
  return out;
}

// YouTube не отмечает Shorts в API. Надёжный признак: страница /shorts/ID у Shorts открывается (200),
// а у обычного видео перенаправляет на /watch (303). Shorts не длиннее 3 минут.
export async function isShort(id: string, durationSec: number | null): Promise<boolean | null> {
  if (durationSec != null && durationSec > 180) return false;
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
    return null;
  } catch {
    return null;
  }
}

export function thumbUrl(id: string) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

// ---------------------------------------------------------------------------
// Вход через Google (OAuth)
// ---------------------------------------------------------------------------

export function oauthUrl(origin: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", `${origin}/api/yt/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YT_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const res = await request(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      ...params,
    }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new YtError(REASONS[body.error] || body.error_description || `Google ответил ${res.status}`);
    err.reason = body.error;
    throw err;
  }
  return body as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

export function exchangeCode(code: string, origin: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: `${origin}/api/yt/oauth/callback` });
}

export async function accessToken(refreshToken: string): Promise<string> {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token;
}

// ---------------------------------------------------------------------------
// Аналитика (YouTube Analytics API v2)
// ---------------------------------------------------------------------------

export type AnalyticsResult = { columns: string[]; rows: any[][] };

export async function analytics(
  token: string,
  q: { startDate: string; endDate: string; metrics: string; dimensions?: string; filters?: string; sort?: string; maxResults?: number; startIndex?: number }
): Promise<AnalyticsResult> {
  const url = new URL(ANALYTICS);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", q.startDate);
  url.searchParams.set("endDate", q.endDate);
  url.searchParams.set("metrics", q.metrics);
  if (q.dimensions) url.searchParams.set("dimensions", q.dimensions);
  if (q.filters) url.searchParams.set("filters", q.filters);
  if (q.sort) url.searchParams.set("sort", q.sort);
  if (q.maxResults) url.searchParams.set("maxResults", String(q.maxResults));
  if (q.startIndex) url.searchParams.set("startIndex", String(q.startIndex));
  const body = await json(url, token);
  return { columns: (body.columnHeaders || []).map((c: any) => c.name), rows: body.rows || [] };
}

// Строки отчёта как объекты: [{ day: "2026-10-01", views: 12, ... }]
export function rowsAsObjects(r: AnalyticsResult): Record<string, any>[] {
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
}

// ---------------------------------------------------------------------------
// Показы и CTR обложек (YouTube Reporting API, суточные отчёты)
// ---------------------------------------------------------------------------

const REACH_REPORT = "channel_reach_basic_a1";

// Задание на ежедневный отчёт. Первые отчёты Google готовит в течение 1–2 суток после создания.
export async function ensureReachJob(token: string): Promise<string> {
  const list = await json(`${REPORTING}/jobs`, token);
  const found = (list.jobs || []).find((j: any) => j.reportTypeId === REACH_REPORT);
  if (found) return found.id;
  const created = await json(`${REPORTING}/jobs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportTypeId: REACH_REPORT, name: "Stats dashboard reach" }),
  });
  return created.id;
}

export async function listReachReports(token: string, jobId: string, createdAfter?: string) {
  const url = new URL(`${REPORTING}/jobs/${jobId}/reports`);
  if (createdAfter) url.searchParams.set("createdAfter", createdAfter);
  const out: { id: string; startTime: string; downloadUrl: string }[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await json(url, token);
    out.push(...(body.reports || []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// CSV отчёта -> строки с колонками date, video_id, video_thumbnail_impressions, video_thumbnail_impressions_ctr
export async function downloadReport(token: string, url: string): Promise<Record<string, string>[]> {
  const res = await request(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new YtError(`Отчёт YouTube не скачался: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift()?.split(",") || [];
  return lines.map((l) => {
    const cells = l.split(",");
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}
