// Сбор статистики Telegram-каналов в базу.
//
// Два режима:
// - без ключей: сайт читает публичные страницы t.me/s/<канал> (подписчики, посты, просмотры, реакции);
// - с аккаунтом Telegram (TG_API_ID, TG_API_HASH и вход в «Настройках»): ещё репосты, комментарии,
//   точные просмотры, а по своим каналам встроенная статистика Telegram.
// Канал в базе определяется по username, поэтому при смене режима история не теряется.
//
// Каждый запуск (4 раза в сутки вместе со сбором Instagram): число подписчиков, свежие посты,
// замеры свежих постов для «охвата за 24 часа». Раз в сутки встроенная статистика своих каналов.

import type { TelegramClient } from "telegram";
import { getSupabase } from "./supabase";
import { storeBuffer, storeImage } from "./storage";
import { dateInTz, LOCAL_TZ } from "./dates";
import * as tg from "./telegram";
import * as pub from "./tgpublic";

export type TgChannelRow = {
  id: string; // username в нижнем регистре
  tg_id: string | null;
  access_hash: string | null;
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

const HOUR = 3600000;
const keyOf = (username: string | null | undefined, fallback: string) => (username || fallback).toLowerCase();
const nameOf = (ch: Pick<TgChannelRow, "username" | "title">) => (ch.username ? "@" + ch.username : ch.title);

export async function getTgChannels(includeInactive = false): Promise<TgChannelRow[]> {
  const { data, error } = await getSupabase().from("tg_channels").select("*").order("is_own", { ascending: false }).order("title");
  if (error) throw new Error(error.message);
  return (data || []).filter((c: TgChannelRow) => includeInactive || c.is_active);
}

async function getTgChannel(id: string): Promise<TgChannelRow> {
  const { data, error } = await getSupabase().from("tg_channels").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Канал не найден");
  return data;
}

// Режим аккаунта включается, когда заданы ключи и выполнен вход
async function accountMode(): Promise<boolean> {
  if (!tg.telegramConfigured()) return false;
  return (await tg.sessionStatus()).connected;
}

function today() {
  return dateInTz(new Date(), LOCAL_TZ);
}

function avatarStale(prev?: TgChannelRow | null) {
  return !prev?.avatar_url || !prev.updated_at || Date.now() - Date.parse(prev.updated_at) > 3 * 24 * HOUR;
}

type ChannelPatch = {
  id: string;
  tg_id: string | null;
  access_hash?: string | null;
  username: string | null;
  title: string;
  about: string | null;
  avatar_url: string | null;
  subscribers: number | null;
  stats_available?: boolean;
  is_own?: boolean;
  is_active?: boolean;
};

async function saveChannel(patch: ChannelPatch) {
  const sb = getSupabase();
  const { error } = await sb.from("tg_channels").upsert({ ...patch, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  if (patch.subscribers != null) {
    const { error: e2 } = await sb.from("tg_channel_daily").upsert(
      { channel_id: patch.id, date: today(), subscribers: patch.subscribers, subscribers_source: "snapshot", updated_at: new Date().toISOString() },
      { onConflict: "channel_id,date" }
    );
    if (e2) throw new Error(e2.message);
  }
}

async function savePosts(channelId: string, posts: tg.ChannelPost[]) {
  if (!posts.length) return;
  const now = new Date().toISOString();
  // Режим без ключей не знает репостов и комментариев: эти колонки не отправляем, чтобы не затереть
  // значения, собранные через аккаунт
  const full = posts.some((p) => p.forwards != null || p.comments != null);
  const { error } = await getSupabase()
    .from("tg_posts")
    .upsert(
      posts.map((p) => ({
        channel_id: channelId,
        msg_id: p.msgId,
        posted_at: p.postedAt,
        text: p.text,
        media_type: p.mediaType,
        views: p.views,
        reactions: p.reactions,
        ...(full ? { forwards: p.forwards, comments: p.comments } : {}),
        updated_at: now,
      })),
      { onConflict: "channel_id,msg_id" }
    );
  if (error) throw new Error(error.message);
}

// Замеры свежих постов и «охват за 24 часа»: просмотры на момент, когда посту исполнились сутки.
// Сайт смотрит посты примерно раз в 6 часов, значение получается интерполяцией
// между замером до и после 24 часов.
async function updateViews24(channelId: string, posts: tg.ChannelPost[]) {
  const sb = getSupabase();
  const now = Date.now();
  const fresh = posts.filter((p) => now - Date.parse(p.postedAt) < 72 * HOUR);
  if (fresh.length) {
    const { error } = await sb.from("tg_post_snapshots").insert(
      fresh.map((p) => ({ channel_id: channelId, msg_id: p.msgId, views: p.views, forwards: p.forwards, reactions: p.reactions }))
    );
    if (error) throw new Error(error.message);
  }
  await sb.from("tg_post_snapshots").delete().lt("captured_at", new Date(now - 7 * 24 * HOUR).toISOString());

  const due = fresh.filter((p) => now - Date.parse(p.postedAt) >= 24 * HOUR).map((p) => p.msgId);
  if (!due.length) return;
  const { data: missing } = await sb
    .from("tg_posts")
    .select("msg_id,posted_at")
    .eq("channel_id", channelId)
    .in("msg_id", due)
    .is("views_24h", null);
  if (!missing?.length) return;
  const { data: snaps } = await sb
    .from("tg_post_snapshots")
    .select("msg_id,captured_at,views")
    .eq("channel_id", channelId)
    .in("msg_id", missing.map((m: any) => m.msg_id));

  for (const m of missing as { msg_id: number; posted_at: string }[]) {
    const target = Date.parse(m.posted_at) + 24 * HOUR;
    const list = (snaps || [])
      .filter((s: any) => Number(s.msg_id) === Number(m.msg_id) && s.views != null)
      .map((s: any) => ({ t: Date.parse(s.captured_at), v: Number(s.views) }))
      .sort((a, b) => a.t - b.t);
    const before = [...list].reverse().find((s) => s.t <= target);
    const after = list.find((s) => s.t >= target);
    let value: number | null = null;
    if (before && after) {
      value = after.t === before.t ? after.v : before.v + ((after.v - before.v) * (target - before.t)) / (after.t - before.t);
    } else if (after && after.t - target <= 6 * HOUR) {
      value = after.v;
    }
    if (value != null) {
      await sb.from("tg_posts").update({ views_24h: Math.round(value) }).eq("channel_id", channelId).eq("msg_id", m.msg_id);
    }
  }
}

// ---------------------------------------------------------------------------
// Режим без ключей: публичные страницы
// ---------------------------------------------------------------------------

async function publicSave(username: string, prev: TgChannelRow | null, extra: Partial<ChannelPatch> = {}) {
  const { info, posts, nextBefore } = await pub.fetchPublicChannel(username);
  const id = keyOf(info.username, username);
  let avatarUrl = prev?.avatar_url ?? null;
  if (info.avatarUrl && avatarStale(prev)) {
    const stored = await storeImage(`tg/${id}.jpg`, info.avatarUrl);
    if (stored) avatarUrl = `${stored}?v=${today()}`;
  }
  await saveChannel({
    id,
    tg_id: info.tgId ?? prev?.tg_id ?? null,
    username: info.username,
    title: info.title,
    about: info.about,
    avatar_url: avatarUrl,
    subscribers: info.subscribers,
    ...extra,
  });
  // Первая страница: около 20 новых постов. Ещё две страницы, чтобы обновить просмотры постов за последние недели
  let all = posts;
  let before = nextBefore;
  for (let i = 0; i < 2 && before; i++) {
    const page = await pub.fetchPublicPosts(info.username, before);
    all = all.concat(page.posts);
    before = page.nextBefore;
  }
  await savePosts(id, all);
  return { id, info, posts: all };
}

async function syncPublic(ch: TgChannelRow): Promise<string> {
  if (!ch.username) return `TG ${ch.title}: нет публичного username, без ключей Telegram канал не читается`;
  const { info, posts } = await publicSave(ch.username, ch);
  await updateViews24(ch.id, posts);
  return `TG ${nameOf(ch)}: подписчиков ${info.subscribers ?? "?"}, постов обновлено ${posts.length} (публичная страница)`;
}

// ---------------------------------------------------------------------------
// Режим аккаунта
// ---------------------------------------------------------------------------

async function accountSave(client: TelegramClient, info: tg.ChannelInfo, entity: any, prev: TgChannelRow | null, extra: Partial<ChannelPatch> = {}) {
  const id = prev?.id ?? keyOf(info.username, info.id);
  let avatarUrl = prev?.avatar_url ?? null;
  if (avatarStale(prev)) {
    const buf = await tg.channelAvatar(client, entity);
    const stored = buf ? await storeBuffer(`tg/${id}.jpg`, new Uint8Array(buf), "image/jpeg") : null;
    if (stored) avatarUrl = `${stored}?v=${today()}`;
  }
  await saveChannel({
    id,
    tg_id: info.id,
    access_hash: info.accessHash,
    username: info.username,
    title: info.title,
    about: info.about,
    avatar_url: avatarUrl,
    subscribers: info.subscribers,
    stats_available: info.statsAvailable,
    ...extra,
  });
  return id;
}

function seriesByName(g: tg.Graph | null, re: RegExp): number[] | null {
  if (!g) return null;
  const key = Object.keys(g.series).find((k) => re.test(g.names[k] || ""));
  return key ? g.series[key] : null;
}

function graphTotals(g: tg.Graph | null): { name: string; value: number }[] {
  if (!g) return [];
  return Object.keys(g.series)
    .map((k) => ({ name: g.names[k] || k, value: g.series[k].reduce((a, b) => a + (b || 0), 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

// Встроенная статистика Telegram: история подписчиков, подписки и отписки, просмотры по дням,
// источники, языки, активность по часам
async function saveBroadcastStats(client: TelegramClient, channelId: string, input: ReturnType<typeof tg.inputChannel>, statsDc: number | null) {
  const s = await tg.fetchBroadcastStats(client, input, statsDc);
  const sb = getSupabase();
  const now = new Date().toISOString();
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const todayDate = today();

  const growth = s.graphs.growth;
  const total = seriesByName(growth, /total|follow|subscri/i) || (growth ? Object.values(growth.series)[0] : null);
  if (growth && total) {
    const rows = growth.x
      .map((x, i) => ({ channel_id: channelId, date: day(x), subscribers: total[i], subscribers_source: "stats", updated_at: now }))
      .filter((r) => r.date < todayDate && r.subscribers != null);
    if (rows.length) await sb.from("tg_channel_daily").upsert(rows, { onConflict: "channel_id,date" });
  }

  const fg = s.graphs.followers;
  const joined = seriesByName(fg, /join/i);
  const left = seriesByName(fg, /left|leave/i);
  if (fg && (joined || left)) {
    const rows = fg.x.map((x, i) => ({ channel_id: channelId, date: day(x), joined: joined?.[i] ?? null, left_count: left?.[i] ?? null, updated_at: now }));
    if (rows.length) await sb.from("tg_channel_daily").upsert(rows, { onConflict: "channel_id,date" });
  }

  const ig = s.graphs.interactions;
  const views = seriesByName(ig, /view/i);
  const shares = seriesByName(ig, /share/i);
  if (ig && (views || shares)) {
    const rows = ig.x.map((x, i) => ({ channel_id: channelId, date: day(x), views: views?.[i] ?? null, shares: shares?.[i] ?? null, updated_at: now }));
    if (rows.length) await sb.from("tg_channel_daily").upsert(rows, { onConflict: "channel_id,date" });
  }

  const summary = {
    period: s.period,
    followers: s.followers,
    viewsPerPost: s.viewsPerPost,
    sharesPerPost: s.sharesPerPost,
    reactionsPerPost: s.reactionsPerPost,
    notificationsPercent: s.notificationsPercent,
    viewsBySource: graphTotals(s.graphs.viewsBySource),
    followersBySource: graphTotals(s.graphs.followersBySource),
    languages: graphTotals(s.graphs.languages),
    topHours: s.graphs.topHours,
  };
  await sb.from("tg_channel_stats").upsert({ channel_id: channelId, date: todayDate, data: summary }, { onConflict: "channel_id,date" });
}

async function syncAccount(client: TelegramClient, ch: TgChannelRow, withStats: boolean): Promise<string> {
  // Каналы, добавленные без ключей, ещё не знают access_hash: находим их по username
  const resolved =
    ch.tg_id && ch.access_hash
      ? await tg.channelInfo(client, ch.tg_id, ch.access_hash)
      : await tg.resolveChannel(client, ch.username || ch.id);
  const { info, entity } = resolved;
  await accountSave(client, info, entity, ch);
  const input = tg.inputChannel(info.id, info.accessHash);
  const page = await tg.fetchPosts(client, input);
  await savePosts(ch.id, page.posts);
  await updateViews24(ch.id, page.posts);
  let statsNote = "";
  if (withStats && ch.is_own) {
    if (info.statsAvailable) {
      try {
        await saveBroadcastStats(client, ch.id, input, info.statsDc);
        statsNote = ", статистика Telegram обновлена";
      } catch (e: any) {
        statsNote = `, статистика Telegram: ${e?.message || e}`;
      }
    } else {
      statsNote = ", статистика Telegram недоступна (аккаунт не админ или мало подписчиков)";
    }
  }
  return `TG ${nameOf(ch)}: подписчиков ${info.subscribers ?? "?"}, постов обновлено ${page.posts.length}${statsNote}`;
}

// ---------------------------------------------------------------------------
// Действия
// ---------------------------------------------------------------------------

export async function addTgChannel(input: string, isOwn: boolean): Promise<TgChannelRow> {
  const username = tg.parseChannelRef(input);
  const { data: prev } = await getSupabase().from("tg_channels").select("*").eq("id", username.toLowerCase()).maybeSingle();
  const extra = { is_own: isOwn, is_active: true };
  let id: string;
  if (await accountMode()) {
    id = await tg.withClient(async (client) => {
      const { info, entity } = await tg.resolveChannel(client, username);
      const channelId = await accountSave(client, info, entity, prev, extra);
      const page = await tg.fetchPosts(client, tg.inputChannel(info.id, info.accessHash));
      await savePosts(channelId, page.posts);
      return channelId;
    });
  } else {
    id = (await publicSave(username, prev, extra)).id;
  }
  return getTgChannel(id);
}

export async function updateTgChannel(id: string): Promise<string> {
  const ch = await getTgChannel(id);
  if (await accountMode()) return tg.withClient((client) => syncAccount(client, ch, true));
  return syncPublic(ch);
}

// Порция архива постов по курсору (номер поста, старше которого читать). null — архив загружен.
export async function loadTgHistory(id: string, cursor: number | null): Promise<{ processed: number; nextCursor: number | null }> {
  const ch = await getTgChannel(id);
  const started = Date.now();
  const done = async (processed: number) => {
    await getSupabase().from("tg_channels").update({ history_loaded: true }).eq("id", ch.id);
    return { processed, nextCursor: null };
  };

  if (await accountMode()) {
    return tg.withClient(async (client) => {
      const { info } =
        ch.tg_id && ch.access_hash ? await tg.channelInfo(client, ch.tg_id, ch.access_hash) : await tg.resolveChannel(client, ch.username || ch.id);
      const channel = tg.inputChannel(info.id, info.accessHash);
      let offset = cursor || 0;
      let processed = 0;
      for (let i = 0; i < 5 && Date.now() - started < 35000; i++) {
        const page = await tg.fetchPosts(client, channel, offset);
        await savePosts(ch.id, page.posts);
        processed += page.posts.length;
        if (page.nextOffset == null) return done(processed);
        offset = page.nextOffset;
      }
      return { processed, nextCursor: offset };
    });
  }

  if (!ch.username) throw new Error("У канала нет публичного username");
  let before = cursor;
  let processed = 0;
  if (before == null) {
    const first = await pub.fetchPublicChannel(ch.username);
    await savePosts(ch.id, first.posts);
    processed += first.posts.length;
    before = first.nextBefore;
  }
  while (before && Date.now() - started < 35000) {
    const page = await pub.fetchPublicPosts(ch.username, before);
    await savePosts(ch.id, page.posts);
    processed += page.posts.length;
    before = page.nextBefore;
  }
  return before ? { processed, nextCursor: before } : done(processed);
}

// Все каналы. withStats: раз в сутки (основной сбор)
export async function runTelegramSync(withStats: boolean): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = [];
  const channels = await getTgChannels();
  if (!channels.length) return { ok: true, log };
  let ok = true;
  const fail = (ch: TgChannelRow, e: any) => {
    ok = false;
    log.push(`TG ${nameOf(ch)}: ОШИБКА: ${e?.message || e}`);
  };

  if (await accountMode()) {
    try {
      await tg.withClient(async (client) => {
        for (const ch of channels) {
          try {
            log.push(await syncAccount(client, ch, withStats));
          } catch (e) {
            fail(ch, e);
          }
        }
      });
    } catch (e: any) {
      ok = false;
      log.push(`Telegram: ОШИБКА: ${e?.message || e}`);
    }
    return { ok, log };
  }

  for (const ch of channels) {
    try {
      log.push(await syncPublic(ch));
    } catch (e) {
      fail(ch, e);
    }
  }
  return { ok, log };
}
