// Сбор статистики YouTube в базу.
//
// Публичные данные (ключ YT_API_KEY): канал, все видео с просмотрами, лайками и комментариями,
// замеры свежих видео для «просмотров за сутки и за неделю». Работает и для конкурентов.
// Аналитика своих каналов (вход Google): просмотры и время просмотра по дням, досмотр,
// подписки и отписки, метрики каждого видео, источники трафика, аудитория, показы и CTR обложек.

import { getSupabase, selectAll } from "./supabase";
import { storeImage } from "./storage";
import { mapPool } from "./pool";
import { addDays, dateInTz, diffDays, LOCAL_TZ, META_TZ } from "./dates";
import { open, seal } from "./secretbox";
import * as yt from "./youtube";

export type YtChannelRow = {
  id: string;
  handle: string | null;
  title: string;
  description: string | null;
  avatar_url: string | null;
  uploads_playlist: string | null;
  published_at: string | null;
  is_own: boolean;
  is_active: boolean;
  subscribers: number | null;
  views_total: number | null;
  videos_total: number | null;
  analytics_linked: boolean;
  history_loaded: boolean;
  reporting_job: string | null;
  updated_at: string | null;
};

const HOUR = 3600000;
const todayMsk = () => dateInTz(new Date(), LOCAL_TZ);
// Аналитика YouTube считает сутки по тихоокеанскому времени
const todayPacific = () => dateInTz(new Date(), META_TZ);
const nameOf = (ch: Pick<YtChannelRow, "handle" | "title">) => (ch.handle ? "@" + ch.handle : ch.title);

export async function getYtChannels(includeInactive = false): Promise<YtChannelRow[]> {
  const { data, error } = await getSupabase().from("yt_channels").select("*").order("is_own", { ascending: false }).order("title");
  if (error) throw new Error(error.message);
  return (data || []).filter((c: YtChannelRow) => includeInactive || c.is_active);
}

async function getYtChannel(id: string): Promise<YtChannelRow> {
  const { data, error } = await getSupabase().from("yt_channels").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Канал не найден");
  return data;
}

// ---------------------------------------------------------------------------
// Токены
// ---------------------------------------------------------------------------

async function ownerToken(ch: YtChannelRow): Promise<string | undefined> {
  if (!ch.analytics_linked) return undefined;
  const sb = getSupabase();
  const { data } = await sb.from("yt_oauth").select("refresh_token").eq("channel_id", ch.id).maybeSingle();
  if (!data) return undefined;
  try {
    return await yt.accessToken(open(data.refresh_token, yt.googleSecret()));
  } catch (e: any) {
    if (e?.reason === "invalid_grant") await sb.from("yt_channels").update({ analytics_linked: false }).eq("id", ch.id);
    throw e;
  }
}

// Для публичных данных: ключ YT_API_KEY, а если его нет, токен любого подключённого канала
async function publicToken(): Promise<string | undefined> {
  if (process.env.YT_API_KEY) return undefined;
  const { data } = await getSupabase().from("yt_channels").select("*").eq("analytics_linked", true).limit(1);
  if (!data?.length) throw new Error("Не задан YT_API_KEY и нет подключённых каналов YouTube");
  return ownerToken(data[0]);
}

// ---------------------------------------------------------------------------
// Канал и видео
// ---------------------------------------------------------------------------

async function saveChannel(info: yt.YtChannelInfo, prev: YtChannelRow | null, extra: Partial<YtChannelRow> = {}) {
  const sb = getSupabase();
  let avatarUrl = prev?.avatar_url ?? null;
  const stale = !prev?.updated_at || Date.now() - Date.parse(prev.updated_at) > 3 * 24 * HOUR;
  if (info.avatar && (!avatarUrl || stale)) {
    const stored = await storeImage(`yt/${info.id}.jpg`, info.avatar);
    if (stored) avatarUrl = `${stored}?v=${todayMsk()}`;
  }
  const { error } = await sb.from("yt_channels").upsert({
    id: info.id,
    handle: info.handle,
    title: info.title,
    description: info.description,
    avatar_url: avatarUrl,
    uploads_playlist: info.uploads,
    published_at: info.publishedAt,
    subscribers: info.subscribers,
    views_total: info.views,
    videos_total: info.videos,
    updated_at: new Date().toISOString(),
    ...extra,
  });
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb.from("yt_channel_daily").upsert(
    {
      channel_id: info.id,
      date: todayMsk(),
      subscribers: info.subscribers,
      subscribers_source: "snapshot",
      views_total: info.views,
      videos_total: info.videos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,date" }
  );
  if (e2) throw new Error(e2.message);
}

async function saveVideos(channelId: string, infos: yt.YtVideoInfo[]) {
  if (!infos.length) return;
  const sb = getSupabase();
  const { data: known } = await sb.from("yt_videos").select("id").in("id", infos.map((v) => v.id));
  const knownIds = new Set((known || []).map((k: any) => k.id));
  const now = new Date().toISOString();
  const base = (v: yt.YtVideoInfo) => ({
    id: v.id,
    channel_id: channelId,
    published_at: v.publishedAt,
    title: v.title,
    description: v.description.slice(0, 3000),
    duration_sec: v.durationSec,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    updated_at: now,
  });
  const fresh = infos.filter((v) => !knownIds.has(v.id));
  const shorts = await mapPool(fresh, 8, (v) => yt.isShort(v.id, v.durationSec));
  // Новые видео и уже известные сохраняем отдельно: у известных не трогаем признак Shorts
  const groups = [
    fresh.map((v, i) => ({ ...base(v), is_short: shorts[i], thumb_url: yt.thumbUrl(v.id) })),
    infos.filter((v) => knownIds.has(v.id)).map(base),
  ];
  for (const rows of groups) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from("yt_videos").upsert(rows.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
  }
}

// Просмотры через сутки и через неделю после выхода: интерполяция между замерами сайта
function valueAt(list: { t: number; v: number }[], target: number, toleranceMs: number): number | null {
  const before = [...list].reverse().find((s) => s.t <= target);
  const after = list.find((s) => s.t >= target);
  if (before && after) {
    return after.t === before.t ? after.v : before.v + ((after.v - before.v) * (target - before.t)) / (after.t - before.t);
  }
  if (after && after.t - target <= toleranceMs) return after.v;
  return null;
}

async function updateMilestones(videos: yt.YtVideoInfo[]) {
  const sb = getSupabase();
  const now = Date.now();
  const fresh = videos.filter((v) => now - Date.parse(v.publishedAt) < 9 * 24 * HOUR);
  if (fresh.length) {
    await sb.from("yt_video_snapshots").insert(fresh.map((v) => ({ video_id: v.id, views: v.views, likes: v.likes, comments: v.comments })));
  }
  await sb.from("yt_video_snapshots").delete().lt("captured_at", new Date(now - 12 * 24 * HOUR).toISOString());
  if (!fresh.length) return;

  const { data: rows } = await sb.from("yt_videos").select("id,published_at,views_24h,views_7d").in("id", fresh.map((v) => v.id));
  const due = (rows || []).filter((r: any) => {
    const age = now - Date.parse(r.published_at);
    return (r.views_24h == null && age >= 24 * HOUR) || (r.views_7d == null && age >= 7 * 24 * HOUR);
  });
  if (!due.length) return;
  const { data: snaps } = await sb.from("yt_video_snapshots").select("video_id,captured_at,views").in("video_id", due.map((d: any) => d.id));
  for (const r of due as any[]) {
    const list = (snaps || [])
      .filter((s: any) => s.video_id === r.id && s.views != null)
      .map((s: any) => ({ t: Date.parse(s.captured_at), v: Number(s.views) }))
      .sort((a, b) => a.t - b.t);
    const pub = Date.parse(r.published_at);
    const patch: Record<string, number> = {};
    if (r.views_24h == null) {
      const v = valueAt(list, pub + 24 * HOUR, 6 * HOUR);
      if (v != null) patch.views_24h = Math.round(v);
    }
    if (r.views_7d == null) {
      const v = valueAt(list, pub + 7 * 24 * HOUR, 12 * HOUR);
      if (v != null) patch.views_7d = Math.round(v);
    }
    if (Object.keys(patch).length) await sb.from("yt_videos").update(patch).eq("id", r.id);
  }
}

// full: обновить статистику всех видео канала (раз в сутки), иначе только новые и свежие
async function syncVideos(ch: YtChannelRow, token: string | undefined, full: boolean): Promise<number> {
  if (!ch.uploads_playlist) return 0;
  const sb = getSupabase();
  const first = await yt.fetchUploadsPage(ch.uploads_playlist, null, token);
  const ids = new Set(first.ids);
  const since = full ? null : new Date(Date.now() - 9 * 24 * HOUR).toISOString();
  const known = await selectAll<{ id: string }>((from, to) => {
    let q = sb.from("yt_videos").select("id").eq("channel_id", ch.id).range(from, to);
    if (since) q = q.gte("published_at", since);
    return q;
  });
  known.forEach((k) => ids.add(k.id));
  const infos = await yt.fetchVideos([...ids], token);
  await saveVideos(ch.id, infos);
  await updateMilestones(infos);
  return infos.length;
}

// ---------------------------------------------------------------------------
// Аналитика своего канала
// ---------------------------------------------------------------------------

const DAY_METRICS = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares";

async function saveDailyAnalytics(ch: YtChannelRow, token: string, start: string, end: string) {
  const sb = getSupabase();
  // Длинные периоды запрашиваем годами
  for (let from = start; from <= end; from = addDays(from, 366)) {
    const to = addDays(from, 365) < end ? addDays(from, 365) : end;
    const r = yt.rowsAsObjects(await yt.analytics(token, { startDate: from, endDate: to, metrics: DAY_METRICS, dimensions: "day", sort: "day" }));
    const rows = r.map((d) => ({
      channel_id: ch.id,
      date: d.day,
      views: d.views,
      watch_minutes: d.estimatedMinutesWatched,
      avg_view_duration: d.averageViewDuration,
      avg_view_percentage: d.averageViewPercentage,
      subs_gained: d.subscribersGained,
      subs_lost: d.subscribersLost,
      likes: d.likes,
      comments: d.comments,
      shares: d.shares,
      updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await sb.from("yt_channel_daily").upsert(rows.slice(i, i + 400), { onConflict: "channel_id,date" });
      if (error) throw new Error(error.message);
    }
  }
}

// Подписчики по дням из аналитики.
// Аналитика с первого дня канала: подписчики(D) = сумма (подписались − отписались) по день D. Это точнее замеров:
// публичный счётчик YouTube у каналов больше 1000 подписчиков округлён до трёх знаков.
// Иначе назад от замера: подписчики(D) = подписчики(D+1) − подписались(D+1) + отписались(D+1).
// Дни без аналитики между ними (YouTube отдаёт её с задержкой 2–3 дня) считаем днями без изменений.
async function reconstructSubscribers(ch: YtChannelRow) {
  const sb = getSupabase();
  type Row = { date: string; subscribers: number | null; subscribers_source: string | null; subs_gained: number | null; subs_lost: number | null };
  const rows = await selectAll<Row>((from, to) =>
    sb
      .from("yt_channel_daily")
      .select("date,subscribers,subscribers_source,subs_gained,subs_lost")
      .eq("channel_id", ch.id)
      .order("date", { ascending: false })
      .range(from, to)
  );
  const updates: { channel_id: string; date: string; subscribers: number; subscribers_source: string }[] = [];
  const set = (r: Row, value: number) => {
    if (r.subscribers !== value || r.subscribers_source !== "calc") updates.push({ channel_id: ch.id, date: r.date, subscribers: value, subscribers_source: "calc" });
  };
  const withAnalytics = rows.filter((r) => r.subs_gained != null && r.subs_lost != null);
  const first = withAnalytics[withAnalytics.length - 1];
  const fromBirth = !!first && !!ch.published_at && diffDays(ch.published_at.slice(0, 10), first.date) <= 1;

  if (fromBirth) {
    let total = 0;
    for (const r of [...withAnalytics].reverse()) {
      total += Number(r.subs_gained) - Number(r.subs_lost);
      set(r, Math.max(0, total));
    }
  } else {
    let next: Row | null = null;
    let nextSubs: number | null = null;
    for (const r of rows) {
      if (r.subscribers_source === "snapshot" && r.subscribers != null) {
        next = r;
        nextSubs = r.subscribers;
        continue;
      }
      let value: number | null = null;
      if (next && nextSubs != null) {
        value = next.subs_gained != null && next.subs_lost != null ? Math.max(0, nextSubs - next.subs_gained + next.subs_lost) : nextSubs;
      }
      if (value != null) set(r, value);
      next = r;
      nextSubs = value ?? r.subscribers;
    }
  }
  for (let i = 0; i < updates.length; i += 400) {
    const { error } = await sb.from("yt_channel_daily").upsert(updates.slice(i, i + 400), { onConflict: "channel_id,date" });
    if (error) throw new Error(error.message);
  }
}

// Метрики каждого видео за всё время
async function saveVideoAnalytics(ch: YtChannelRow, token: string) {
  const sb = getSupabase();
  const known = await selectAll<{ id: string; published_at: string }>((from, to) =>
    sb.from("yt_videos").select("id,published_at").eq("channel_id", ch.id).range(from, to)
  );
  const pub = new Map(known.map((k) => [k.id, k.published_at]));
  const start = ch.published_at ? ch.published_at.slice(0, 10) : "2006-01-01";
  const now = new Date().toISOString();
  for (let startIndex = 1; startIndex < 5000; startIndex += 200) {
    const r = yt.rowsAsObjects(
      await yt.analytics(token, {
        startDate: start,
        endDate: todayPacific(),
        metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,shares",
        dimensions: "video",
        sort: "-views",
        maxResults: 200,
        startIndex,
      })
    );
    const rows = r
      .filter((d) => pub.has(d.video))
      .map((d) => ({
        id: d.video,
        channel_id: ch.id,
        published_at: pub.get(d.video)!,
        watch_minutes: d.estimatedMinutesWatched,
        avg_view_duration: d.averageViewDuration,
        avg_view_percentage: d.averageViewPercentage,
        subs_gained: d.subscribersGained,
        shares: d.shares,
        analytics_updated_at: now,
      }));
    if (rows.length) {
      const { error } = await sb.from("yt_videos").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    if (r.length < 200) break;
  }
}

// Просмотры за первую неделю для видео, которые вышли до подключения сайта: сумма дневных просмотров
// из аналитики за день выхода и 6 следующих дней (сутки по тихоокеанскому времени, как в YouTube Studio).
// Аналитика приходит с задержкой 2–3 дня, поэтому берём видео старше 10 дней.
async function saveFirstWeekViews(ch: YtChannelRow, token: string) {
  const sb = getSupabase();
  const due = await selectAll<{ id: string; published_at: string }>((from, to) =>
    sb
      .from("yt_videos")
      .select("id,published_at")
      .eq("channel_id", ch.id)
      .is("views_7d", null)
      .lt("published_at", new Date(Date.now() - 10 * 24 * HOUR).toISOString())
      .range(from, to)
  );
  await mapPool(due, 6, async (v) => {
    const start = dateInTz(new Date(v.published_at), META_TZ);
    const r = yt.rowsAsObjects(await yt.analytics(token, { startDate: start, endDate: addDays(start, 6), metrics: "views", dimensions: "day", filters: `video==${v.id}` }));
    const views = r.reduce((a, d) => a + Number(d.views || 0), 0);
    await sb.from("yt_videos").update({ views_7d: views }).eq("id", v.id);
  });
}

const TRAFFIC: Record<string, string> = {
  YT_SEARCH: "Поиск YouTube",
  YT_CHANNEL: "Страница канала",
  SHORTS_CONTENT_LINKS: "Ссылки из Shorts",
  SUGGESTED_VIDEO: "Рекомендации к видео",
  BROWSE: "Главная и подписки",
  SHORTS: "Лента Shorts",
  EXT_URL: "Внешние сайты",
  NO_LINK_OTHER: "Прямые переходы",
  CHANNEL: "Страница канала",
  PLAYLIST: "Плейлисты",
  NOTIFICATION: "Уведомления",
  SUBSCRIBER: "Лента подписок",
  END_SCREEN: "Конечные заставки",
  ANNOTATION: "Подсказки и аннотации",
  HASHTAGS: "Хештеги",
  RELATED_VIDEO: "Похожие видео",
  YT_OTHER_PAGE: "Другие страницы YouTube",
  YT_PLAYLIST_PAGE: "Страница плейлиста",
  SOUND_PAGE: "Страница звука",
  LIVE_REDIRECT: "Переход с трансляции",
  CAMPAIGN_CARD: "Карточки кампании",
  ADVERTISING: "Реклама",
  PRODUCT_PAGE: "Страница товара",
  NO_LINK_EMBEDDED: "Встроенный плеер",
  VIDEO_REMIXES: "Ремиксы",
};
const DEVICES: Record<string, string> = { MOBILE: "Телефон", DESKTOP: "Компьютер", TABLET: "Планшет", TV: "Телевизор", GAME_CONSOLE: "Игровая приставка", UNKNOWN_PLATFORM: "Другое" };
const CONTENT: Record<string, string> = { shorts: "Shorts", videoOnDemand: "Видео", liveStream: "Трансляции", story: "Истории" };

// Разбивки за последние 28 дней. Пол, возраст и страны YouTube скрывает, пока просмотров мало,
// поэтому для небольших каналов период расширяется до 90 дней, года и всего времени.
async function saveBreakdowns(ch: YtChannelRow, token: string) {
  const end = todayPacific();
  const born = ch.published_at ? ch.published_at.slice(0, 10) : addDays(end, -3650);
  const windows = [...[27, 89, 364].map((n) => addDays(end, -n)).filter((d) => d > born), born];
  let start = windows[0];
  let traffic: Record<string, any>[] = [];
  let demo: Record<string, any>[] = [];
  let countries: Record<string, any>[] = [];
  let devices: Record<string, any>[] = [];
  let subscribed: Record<string, any>[] = [];
  let content: Record<string, any>[] = [];
  for (const from of windows) {
    const q = async (metrics: string, dimensions: string, extra: Record<string, any> = {}) => {
      try {
        return yt.rowsAsObjects(await yt.analytics(token, { startDate: from, endDate: end, metrics, dimensions, ...extra }));
      } catch {
        return [];
      }
    };
    start = from;
    [traffic, demo, countries, devices, subscribed, content] = await Promise.all([
      q("views,estimatedMinutesWatched", "insightTrafficSourceType", { sort: "-views" }),
      q("viewerPercentage", "ageGroup,gender"),
      q("views,estimatedMinutesWatched", "country", { sort: "-views", maxResults: 10 }),
      q("views", "deviceType", { sort: "-views" }),
      q("views,estimatedMinutesWatched", "subscribedStatus"),
      q("views,estimatedMinutesWatched", "creatorContentType", { sort: "-views" }),
    ]);
    if (demo.length && countries.length) break;
  }
  const data = {
    period: { from: start, to: end },
    traffic: traffic.map((r) => ({ name: TRAFFIC[r.insightTrafficSourceType] || r.insightTrafficSourceType, views: r.views, minutes: r.estimatedMinutesWatched })),
    ageGender: demo.map((r) => ({
      age: String(r.ageGroup).replace(/^age/, "").replace(/-$/, "+").replace("-", "–"),
      gender: r.gender,
      percent: r.viewerPercentage,
    })),
    countries: countries.map((r) => ({ code: r.country, views: r.views, minutes: r.estimatedMinutesWatched })),
    devices: devices.map((r) => ({ name: DEVICES[r.deviceType] || r.deviceType, views: r.views })),
    subscribed: subscribed.map((r) => ({ name: r.subscribedStatus === "SUBSCRIBED" ? "Подписчики" : "Не подписчики", views: r.views, minutes: r.estimatedMinutesWatched })),
    content: content.map((r) => ({ name: CONTENT[r.creatorContentType] || r.creatorContentType, views: r.views, minutes: r.estimatedMinutesWatched })),
  };
  await getSupabase().from("yt_channel_stats").upsert({ channel_id: ch.id, date: todayMsk(), data }, { onConflict: "channel_id,date" });
}

// Показы и CTR обложек: суточные отчёты Reporting API. Первые появляются через 1–2 суток после подключения.
async function saveReach(ch: YtChannelRow, token: string, all: boolean): Promise<string> {
  const sb = getSupabase();
  let jobId = ch.reporting_job;
  if (!jobId) {
    jobId = await yt.ensureReachJob(token);
    await sb.from("yt_channels").update({ reporting_job: jobId }).eq("id", ch.id);
  }
  const createdAfter = all ? undefined : new Date(Date.now() - 5 * 24 * HOUR).toISOString();
  const reports = await yt.listReachReports(token, jobId, createdAfter);
  if (!reports.length) return "показы обложек: отчётов ещё нет, Google готовит их 1–2 суток";

  // Строки отчёта разбиты по стране, подписке и т. п.: сводим в видео × день, CTR взвешиваем по показам
  const agg = new Map<string, { video_id: string; date: string; impressions: number; clicks: number }>();
  for (const rep of reports) {
    const rows = await yt.downloadReport(token, rep.downloadUrl);
    for (const r of rows) {
      const imp = Number(r.video_thumbnail_impressions || 0);
      const rawCtr = Number(r.video_thumbnail_impressions_ctr || 0);
      const ctr = rawCtr <= 1 ? rawCtr : rawCtr / 100;
      const d = String(r.date || "");
      const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
      if (!r.video_id || !date) continue;
      const key = `${r.video_id}|${date}`;
      const cur = agg.get(key) || { video_id: r.video_id, date, impressions: 0, clicks: 0 };
      cur.impressions += imp;
      cur.clicks += imp * ctr;
      agg.set(key, cur);
    }
  }
  const rows = [...agg.values()].map((a) => ({
    channel_id: ch.id,
    video_id: a.video_id,
    date: a.date,
    impressions: a.impressions,
    ctr: a.impressions ? (a.clicks / a.impressions) * 100 : null,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("yt_reach").upsert(rows.slice(i, i + 500), { onConflict: "video_id,date" });
    if (error) throw new Error(error.message);
  }

  // Пересчёт: канал по дням и каждое видео за всё время
  const all_ = await selectAll<{ video_id: string; date: string; impressions: number; ctr: number | null }>((from, to) =>
    sb.from("yt_reach").select("video_id,date,impressions,ctr").eq("channel_id", ch.id).range(from, to)
  );
  const byDate = new Map<string, { imp: number; clicks: number }>();
  const byVideo = new Map<string, { imp: number; clicks: number }>();
  for (const r of all_) {
    const imp = Number(r.impressions || 0);
    const clicks = (imp * Number(r.ctr || 0)) / 100;
    for (const [map, key] of [
      [byDate, r.date],
      [byVideo, r.video_id],
    ] as const) {
      const cur = map.get(key) || { imp: 0, clicks: 0 };
      cur.imp += imp;
      cur.clicks += clicks;
      map.set(key, cur);
    }
  }
  const dayRows = [...byDate].map(([date, v]) => ({
    channel_id: ch.id,
    date,
    impressions: v.imp,
    impressions_ctr: v.imp ? (v.clicks / v.imp) * 100 : null,
  }));
  for (let i = 0; i < dayRows.length; i += 400) {
    await sb.from("yt_channel_daily").upsert(dayRows.slice(i, i + 400), { onConflict: "channel_id,date" });
  }
  await mapPool([...byVideo], 10, async ([id, v]) => {
    await sb.from("yt_videos").update({ impressions: v.imp, impressions_ctr: v.imp ? (v.clicks / v.imp) * 100 : null }).eq("id", id);
  });
  return `показы обложек: отчётов ${reports.length}`;
}

async function syncAnalytics(ch: YtChannelRow, token: string, history: boolean): Promise<string> {
  const end = todayPacific();
  const start = history ? (ch.published_at ? ch.published_at.slice(0, 10) : addDays(end, -365)) : addDays(end, -30);
  await saveDailyAnalytics(ch, token, start, end);
  await reconstructSubscribers(ch);
  await saveVideoAnalytics(ch, token);
  await saveFirstWeekViews(ch, token).catch(() => null);
  await saveBreakdowns(ch, token);
  let reach = "";
  try {
    reach = await saveReach(ch, token, history);
  } catch (e: any) {
    reach = `показы обложек: ${e?.message || e}`;
  }
  return `аналитика с ${start}, ${reach}`;
}

// ---------------------------------------------------------------------------
// Действия
// ---------------------------------------------------------------------------

export async function addYtChannel(input: string, isOwn: boolean): Promise<YtChannelRow> {
  const ref = yt.parseYtRef(input);
  const token = await publicToken();
  const info = await yt.fetchChannel(ref, token);
  const { data: prev } = await getSupabase().from("yt_channels").select("*").eq("id", info.id).maybeSingle();
  await saveChannel(info, prev, { is_own: isOwn, is_active: true });
  const ch = await getYtChannel(info.id);
  await syncVideos(ch, token, false);
  return ch;
}

async function syncChannel(ch: YtChannelRow, full: boolean): Promise<string> {
  const owner = await ownerToken(ch).catch(() => undefined);
  const token = owner ?? (await publicToken());
  const info = await yt.fetchChannel({ id: ch.id }, token);
  await saveChannel(info, ch);
  const updated = await syncVideos({ ...ch, uploads_playlist: info.uploads }, token, full);
  let note = "";
  if (full && owner) {
    try {
      note = `, ${await syncAnalytics(ch, owner, false)}`;
    } catch (e: any) {
      note = `, аналитика: ОШИБКА: ${e?.message || e}`;
    }
  } else if (full && ch.is_own && !ch.analytics_linked) {
    note = ", аналитика не подключена";
  }
  return `YT ${nameOf(ch)}: подписчиков ${info.subscribers ?? "скрыто"}, видео обновлено ${updated}${note}`;
}

export async function updateYtChannel(id: string): Promise<string> {
  return syncChannel(await getYtChannel(id), true);
}

// Порция архива видео (до 300 штук) по курсору страницы. На первом шаге ещё и вся аналитика канала.
export async function loadYtHistory(id: string, cursor: string | null): Promise<{ processed: number; nextCursor: string | null; note?: string }> {
  const ch = await getYtChannel(id);
  if (!ch.uploads_playlist) throw new Error("У канала нет списка видео");
  const started = Date.now();
  const owner = await ownerToken(ch).catch(() => undefined);
  const token = owner ?? (await publicToken());
  let note: string | undefined;
  if (!cursor && owner) note = await syncAnalytics(ch, owner, true);
  let page: string | null = cursor;
  let processed = 0;
  do {
    const res = await yt.fetchUploadsPage(ch.uploads_playlist, page, token);
    const infos = await yt.fetchVideos(res.ids, token);
    await saveVideos(ch.id, infos);
    processed += infos.length;
    page = res.next;
  } while (page && Date.now() - started < 35000);
  if (!page) {
    await getSupabase().from("yt_channels").update({ history_loaded: true }).eq("id", ch.id);
    // Видео загружены: подтягиваем их аналитику, если канал подключён
    if (owner) await saveVideoAnalytics(ch, owner).catch(() => null);
  }
  return { processed, nextCursor: page, note };
}

// Вход Google: сохраняет доступ ко всем каналам, которые выбрал владелец
export async function linkGoogle(code: string, origin: string): Promise<YtChannelRow[]> {
  const tokens = await yt.exchangeCode(code, origin);
  if (!tokens.refresh_token) {
    throw new Error("Google не выдал постоянный доступ. Удалите доступ приложения в настройках аккаунта Google (Безопасность → Сторонние приложения) и подключите снова");
  }
  const channels = await yt.fetchMyChannels(tokens.access_token);
  if (!channels.length) throw new Error("У этого аккаунта Google нет канала YouTube. При входе выберите аккаунт или канал бренда");
  const sb = getSupabase();
  const sealed = seal(tokens.refresh_token, yt.googleSecret());
  for (const info of channels) {
    const { data: prev } = await sb.from("yt_channels").select("*").eq("id", info.id).maybeSingle();
    await saveChannel(info, prev, { is_own: true, is_active: true, analytics_linked: true });
    const { error } = await sb.from("yt_oauth").upsert({ channel_id: info.id, refresh_token: sealed, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
  return Promise.all(channels.map((c) => getYtChannel(c.id)));
}

export async function unlinkGoogle(id: string) {
  const sb = getSupabase();
  await sb.from("yt_oauth").delete().eq("channel_id", id);
  await sb.from("yt_channels").update({ analytics_linked: false }).eq("id", id);
}

// Удержание аудитории видео (только свои подключённые каналы)
export async function videoRetention(videoId: string) {
  const sb = getSupabase();
  const { data: v } = await sb.from("yt_videos").select("channel_id,published_at").eq("id", videoId).maybeSingle();
  if (!v) return null;
  const ch = await getYtChannel(v.channel_id);
  const token = await ownerToken(ch).catch(() => undefined);
  if (!token) return null;
  const r = yt.rowsAsObjects(
    await yt.analytics(token, {
      startDate: v.published_at.slice(0, 10),
      endDate: todayPacific(),
      metrics: "audienceWatchRatio,relativeRetentionPerformance",
      dimensions: "elapsedVideoTimeRatio",
      filters: `video==${videoId}`,
    })
  );
  return r.map((x) => ({ ratio: x.elapsedVideoTimeRatio, watch: x.audienceWatchRatio, relative: x.relativeRetentionPerformance }));
}

// Все каналы. full: раз в сутки (все видео и аналитика), иначе только свежие видео
export async function runYoutubeSync(full: boolean): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = [];
  const status = yt.ytStatus();
  if (!status.apiKey && !status.oauth) return { ok: true, log };
  const channels = await getYtChannels();
  let ok = true;
  for (const ch of channels) {
    try {
      log.push(await syncChannel(ch, full));
    } catch (e: any) {
      ok = false;
      log.push(`YT ${nameOf(ch)}: ОШИБКА: ${e?.message || e}`);
    }
  }
  return { ok, log };
}
