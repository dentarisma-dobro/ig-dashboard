// Сбор статистики из Instagram в базу Supabase.
//
// Ежедневный cron (vercel.json) вызывает runScheduledSync: для каждого аккаунта
// обновляет профиль, дневную статистику за последние 7 дней (или 30, если истории ещё нет),
// свежие публикации, активные Stories и аудиторию.
// Кнопки в разделе «Настройки» вызывают те же шаги по одному через /api/sync.

import { getSupabase, MEDIA_BUCKET, selectAll } from "./supabase";
import * as ig from "./instagram";
import { mapPool } from "./pool";
import { addDays, dateRange, diffDays, lastCompleteMetaDay, todayUtc } from "./dates";

export type AccountRow = {
  id: string;
  username: string;
  display_name: string;
  page_id?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  followers_count?: number | null;
  is_active?: boolean;
  profile_updated_at?: string | null;
};

// ---------------------------------------------------------------------------
// Аккаунты
// ---------------------------------------------------------------------------

export async function getAccounts(includeInactive = false): Promise<AccountRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("accounts").select("*").order("display_name");
  if (error) throw new Error(error.message);
  let rows: AccountRow[] = data || [];
  if (rows.length === 0) rows = await seedAccounts();
  return includeInactive ? rows : rows.filter((r) => r.is_active !== false);
}

export async function getAccount(id: string): Promise<AccountRow> {
  const { data, error } = await getSupabase().from("accounts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Аккаунт ${id} не найден`);
  return data;
}

// Пустая база: берём аккаунты из IG_ACCOUNTS или из списка, доступного токену
async function seedAccounts(): Promise<AccountRow[]> {
  let list: { id: string; username: string; display_name?: string; page_id?: string }[] = [];
  try {
    list = JSON.parse(process.env.IG_ACCOUNTS || "[]");
  } catch {
    list = [];
  }
  if (list.length === 0) {
    const found = await ig.fetchAvailableAccounts();
    list = found.map((a) => ({ id: a.id, username: a.username, display_name: a.name, page_id: a.page_id }));
  }
  if (list.length === 0) return [];
  const sb = getSupabase();
  const { error } = await sb.from("accounts").upsert(
    list.map((a) => ({
      id: a.id,
      username: a.username,
      display_name: a.display_name || a.username,
      page_id: a.page_id || null,
    }))
  );
  if (error) throw new Error(error.message);
  const { data } = await sb.from("accounts").select("*").order("display_name");
  return data || [];
}

export async function addAccount(id: string): Promise<AccountRow> {
  const profile = await ig.fetchProfile(id);
  const sb = getSupabase();
  const { error } = await sb.from("accounts").upsert({
    id,
    username: profile.username,
    display_name: profile.name || profile.username,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  const account = await getAccount(id);
  await syncProfile(account);
  return getAccount(id);
}

// ---------------------------------------------------------------------------
// Картинки: Instagram отдаёт временные ссылки, поэтому копируем их в Supabase Storage
// ---------------------------------------------------------------------------

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(MEDIA_BUCKET);
  if (!data) await sb.storage.createBucket(MEDIA_BUCKET, { public: true });
  bucketReady = true;
}

export async function storeImage(path: string, src: string): Promise<string | null> {
  try {
    await ensureBucket();
    const res = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    const sb = getSupabase();
    const { error } = await sb.storage
      .from(MEDIA_BUCKET)
      .upload(path, body, { contentType: type, upsert: true, cacheControl: "31536000" });
    if (error) return null;
    return sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Шаги сбора
// ---------------------------------------------------------------------------

export async function syncProfile(account: AccountRow): Promise<ig.IgProfile> {
  const p = await ig.fetchProfile(account.id);
  let avatarUrl = account.avatar_url || null;
  const stale =
    !account.profile_updated_at ||
    Date.now() - Date.parse(account.profile_updated_at) > 3 * 86400000;
  if (p.profile_picture_url && (!avatarUrl || stale)) {
    const stored = await storeImage(`avatars/${account.id}.jpg`, p.profile_picture_url);
    if (stored) avatarUrl = `${stored}?v=${todayUtc()}`;
  }
  const { error } = await getSupabase()
    .from("accounts")
    .update({
      username: p.username,
      name: p.name ?? null,
      biography: p.biography ?? null,
      website: p.website ?? null,
      followers_count: p.followers_count ?? null,
      follows_count: p.follows_count ?? null,
      media_count: p.media_count ?? null,
      avatar_url: avatarUrl,
      profile_updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);
  if (error) throw new Error(error.message);
  return p;
}

// Сколько дней истории подтягивать: 30 (максимум Instagram), если её ещё нет
export async function dailyDaysNeeded(accountId: string): Promise<number> {
  const since = addDays(lastCompleteMetaDay(), -29);
  const { count } = await getSupabase()
    .from("account_daily")
    .select("date", { count: "exact", head: true })
    .eq("account_id", accountId)
    .gte("date", since)
    .not("views", "is", null);
  return (count || 0) >= 25 ? 7 : 30;
}

export async function syncDaily(
  account: AccountRow,
  days: number,
  profile?: ig.IgProfile | null
): Promise<{ days: number; from: string; to: string }> {
  const sb = getSupabase();
  const last = lastCompleteMetaDay();
  const dates = dateRange(addDays(last, -(Math.min(days, 30) - 1)), last);
  const now = new Date().toISOString();

  const results = await mapPool(dates, 4, async (date) => ({
    date,
    t: await ig.fetchDayTotals(account.id, date),
  }));

  const rows = results.map(({ date, t }) => ({
    account_id: account.id,
    date,
    reach: t.reach ?? null,
    views: t.views ?? null,
    profile_views: t.profile_views ?? null,
    accounts_engaged: t.accounts_engaged ?? null,
    total_interactions: t.total_interactions ?? null,
    likes: t.likes ?? null,
    comments: t.comments ?? null,
    saves: t.saves ?? null,
    shares: t.shares ?? null,
    replies: t.replies ?? null,
    reposts: t.reposts ?? null,
    website_clicks: t.website_clicks ?? null,
    profile_links_taps: t.profile_links_taps ?? null,
    follows: t.follows ?? null,
    unfollows: t.unfollows ?? null,
    updated_at: now,
  }));
  const { error } = await sb.from("account_daily").upsert(rows, { onConflict: "account_id,date" });
  if (error) throw new Error(error.message);

  // Замер подписчиков: относим к последним завершённым суткам, первый замер не перезаписываем
  if (profile?.followers_count != null) {
    const { data: existing } = await sb
      .from("account_daily")
      .select("followers_source")
      .eq("account_id", account.id)
      .eq("date", last)
      .maybeSingle();
    if (existing?.followers_source !== "snapshot") {
      const { error: e2 } = await sb.from("account_daily").upsert(
        { account_id: account.id, date: last, followers: profile.followers_count, followers_source: "snapshot" },
        { onConflict: "account_id,date" }
      );
      if (e2) throw new Error(e2.message);
    }
  }

  await reconstructFollowers(account.id);
  return { days: dates.length, from: dates[0], to: last };
}

// Восстанавливает число подписчиков на дни без замера:
// подписчики(D) = подписчики(D+1) − подписались(D+1) + отписались(D+1)
async function reconstructFollowers(accountId: string) {
  const sb = getSupabase();
  type Row = { date: string; followers: number | null; followers_source: string | null; follows: number | null; unfollows: number | null };
  const rows = await selectAll<Row>((from, to) =>
    sb
      .from("account_daily")
      .select("date,followers,followers_source,follows,unfollows")
      .eq("account_id", accountId)
      .order("date", { ascending: false })
      .range(from, to)
  );

  const updates: { account_id: string; date: string; followers: number; followers_source: string }[] = [];
  let next: Row | null = null;
  let nextFollowers: number | null = null;
  for (const r of rows) {
    const measured = (r.followers_source === "snapshot" || r.followers_source === "legacy") && r.followers != null;
    if (measured) {
      next = r;
      nextFollowers = r.followers;
      continue;
    }
    let value: number | null = null;
    if (next && nextFollowers != null && diffDays(r.date, next.date) === 1 && next.follows != null && next.unfollows != null) {
      value = nextFollowers - next.follows + next.unfollows;
    }
    if (value != null && (r.followers !== value || r.followers_source !== "calc")) {
      updates.push({ account_id: accountId, date: r.date, followers: value, followers_source: "calc" });
    }
    next = r;
    nextFollowers = value ?? r.followers;
  }
  if (updates.length) {
    const { error } = await sb.from("account_daily").upsert(updates, { onConflict: "account_id,date" });
    if (error) throw new Error(error.message);
  }
}

// mode "recent": первая страница ленты, обновляются посты за 45 дней и последние 25.
// mode "page": одна страница архива (25 постов) по курсору, для загрузки всей истории.
export async function syncMedia(
  account: AccountRow,
  opts: { mode: "recent" | "page"; cursor?: string }
): Promise<{ processed: number; noInsights: number; nextCursor: string | null }> {
  const sb = getSupabase();
  const page = await ig.fetchMediaPage(account.id, opts.cursor, opts.mode === "recent" ? 50 : 25);
  let items = page.items.filter((m) => m.media_product_type !== "STORY");
  if (opts.mode === "recent") {
    const cutoff = Date.now() - 45 * 86400000;
    items = items.filter((m, i) => i < 25 || Date.parse(m.timestamp) >= cutoff);
  }
  if (items.length === 0) return { processed: 0, noInsights: 0, nextCursor: page.nextCursor };

  const { data: existing } = await sb.from("posts").select("id,thumb_url").in("id", items.map((m) => m.id));
  const thumbs = new Map<string, string | null>((existing || []).map((e: any) => [e.id, e.thumb_url]));
  const now = new Date().toISOString();

  const processed = await mapPool(items, 5, async (m) => {
    const ins = await ig.fetchMediaInsights(m);
    const cover = ig.coverUrl(m);
    let thumb = thumbs.get(m.id) || null;
    if (!thumb && cover) thumb = await storeImage(`posts/${m.id}.jpg`, cover);
    const v = ins.values;
    const base = {
      id: m.id,
      account_id: account.id,
      media_type: m.media_type,
      media_product_type: m.media_product_type ?? null,
      caption: m.caption || "",
      permalink: m.permalink ?? null,
      thumbnail_url: cover,
      thumb_url: thumb,
      posted_at: m.timestamp,
      likes: v.likes ?? m.like_count ?? 0,
      comments: v.comments ?? m.comments_count ?? 0,
      updated_at: now,
    };
    if (!ins.ok) return { ok: false as const, row: base };
    return {
      ok: true as const,
      row: {
        ...base,
        saved: v.saved ?? 0,
        shares: v.shares ?? 0,
        reach: v.reach ?? 0,
        views: v.views ?? null,
        total_interactions: v.total_interactions ?? null,
        profile_visits: v.profile_visits ?? null,
        follows: v.follows ?? null,
        reposts: v.reposts ?? null,
        avg_watch_time_ms: v.ig_reels_avg_watch_time ?? null,
        total_watch_time_ms: v.ig_reels_video_view_total_time ?? null,
        insights_updated_at: now,
      },
    };
  });

  // Две группы отдельно: иначе Supabase обнулит метрики постов, у которых Instagram не отдал статистику
  const withInsights = processed.filter((p) => p.ok).map((p) => p.row as any);
  const withoutInsights = processed.filter((p) => !p.ok).map((p) => p.row);
  for (const group of [withInsights, withoutInsights]) {
    if (!group.length) continue;
    const { error } = await sb.from("posts").upsert(group);
    if (error) throw new Error(error.message);
  }

  if (withInsights.length) {
    const date = todayUtc();
    const { error } = await sb.from("post_daily").upsert(
      withInsights.map((r) => ({
        post_id: r.id,
        date,
        account_id: account.id,
        likes: r.likes,
        comments: r.comments,
        saved: r.saved,
        shares: r.shares,
        reach: r.reach,
        views: r.views,
        total_interactions: r.total_interactions,
        captured_at: now,
      })),
      { onConflict: "post_id,date" }
    );
    if (error) throw new Error(error.message);
  }

  return {
    processed: items.length,
    noInsights: withoutInsights.length,
    nextCursor: opts.mode === "page" ? page.nextCursor : null,
  };
}

export async function syncStories(account: AccountRow): Promise<{ active: number }> {
  const sb = getSupabase();
  const stories = await ig.fetchActiveStories(account.id);
  if (stories.length === 0) return { active: 0 };

  const { data: existing } = await sb.from("stories").select("id,thumb_url").in("id", stories.map((s) => s.id));
  const thumbs = new Map<string, string | null>((existing || []).map((e: any) => [e.id, e.thumb_url]));
  const now = new Date().toISOString();

  const processed = await mapPool(stories, 4, async (s) => {
    const ins = await ig.fetchStoryInsights(s.id);
    let thumb = thumbs.get(s.id) || null;
    const cover = s.thumbnail_url || (s.media_type !== "VIDEO" ? s.media_url : null);
    if (!thumb && cover) thumb = await storeImage(`stories/${s.id}.jpg`, cover);
    const base = {
      id: s.id,
      account_id: account.id,
      posted_at: s.timestamp,
      media_type: s.media_type,
      permalink: s.permalink ?? null,
      thumb_url: thumb,
      captured_at: now,
      updated_at: now,
      insights_ok: ins.ok,
    };
    if (!ins.ok) return { ok: false as const, row: base };
    const v = ins.values;
    return {
      ok: true as const,
      row: {
        ...base,
        reach: v.reach ?? 0,
        views: v.views ?? null,
        replies: v.replies ?? 0,
        shares: v.shares ?? null,
        total_interactions: v.total_interactions ?? null,
        follows: v.follows ?? null,
        profile_visits: v.profile_visits ?? null,
        taps_forward: v.taps_forward ?? null,
        taps_back: v.taps_back ?? null,
        exits: v.exits ?? 0,
        swipe_forward: v.swipe_forward ?? null,
      },
    };
  });

  for (const ok of [true, false]) {
    const group = processed.filter((p) => p.ok === ok).map((p) => p.row);
    if (!group.length) continue;
    const { error } = await sb.from("stories").upsert(group);
    if (error) throw new Error(error.message);
  }
  return { active: stories.length };
}

export async function syncAudience(account: AccountRow, force = false): Promise<{ saved: boolean; skipped?: boolean }> {
  const sb = getSupabase();
  const date = todayUtc();
  if (!force) {
    const { data } = await sb
      .from("account_audience")
      .select("date")
      .eq("account_id", account.id)
      .eq("date", date)
      .maybeSingle();
    if (data) return { saved: false, skipped: true };
  }
  const a = await ig.fetchAudience(account.id);
  if (!a.age && !a.gender && !a.city && !a.country) return { saved: false };
  const { error } = await sb.from("account_audience").upsert({ account_id: account.id, date, ...a });
  if (error) throw new Error(error.message);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Полный проход (cron и кнопка «Обновить сейчас»)
// ---------------------------------------------------------------------------

export async function updateAccount(account: AccountRow, log: string[]): Promise<boolean> {
  const name = "@" + account.username;
  let ok = true;
  const step = async <T>(label: string, fn: () => Promise<T>, describe: (r: T) => string) => {
    try {
      const r = await fn();
      log.push(`${name}: ${label} — ${describe(r)}`);
      return r;
    } catch (e: any) {
      ok = false;
      log.push(`${name}: ${label} — ОШИБКА: ${e?.message || e}`);
      return null;
    }
  };

  const profile = await step("профиль", () => syncProfile(account), (p) => `подписчиков ${p.followers_count ?? "?"}`);
  await step(
    "статистика по дням",
    async () => syncDaily(account, await dailyDaysNeeded(account.id), profile),
    (r) => `${r.days} дн. (${r.from} — ${r.to})`
  );
  await step("публикации", () => syncMedia(account, { mode: "recent" }), (r) =>
    r.noInsights ? `обновлено ${r.processed}, без статистики ${r.noInsights}` : `обновлено ${r.processed}`
  );
  await step("stories", () => syncStories(account), (r) => `активных сейчас ${r.active}`);
  await step("аудитория", () => syncAudience(account), (r) =>
    r.skipped ? "уже обновлена сегодня" : r.saved ? "обновлена" : "Instagram не отдаёт (нужно от 100 подписчиков)"
  );
  return ok;
}

export async function startRun(source: string): Promise<number | null> {
  const { data } = await getSupabase().from("sync_runs").insert({ source }).select("id").maybeSingle();
  return data?.id ?? null;
}

export async function finishRun(id: number | null, ok: boolean, log: string[]) {
  if (id == null) return;
  await getSupabase()
    .from("sync_runs")
    .update({ ok, log, finished_at: new Date().toISOString() })
    .eq("id", id);
}

export async function runScheduledSync(source: "cron" | "manual"): Promise<{ ok: boolean; log: string[] }> {
  const runId = await startRun(source);
  const log: string[] = [];
  let ok = true;
  try {
    const accounts = await getAccounts();
    if (accounts.length === 0) log.push("Нет отслеживаемых аккаунтов");
    const results = await mapPool(accounts, 3, (a) => updateAccount(a, log));
    ok = results.every(Boolean);
  } catch (e: any) {
    ok = false;
    log.push(`ОШИБКА: ${e?.message || e}`);
  }
  await finishRun(runId, ok, log);
  return { ok, log };
}

// Только Stories: /api/cron/stories вызывается ещё три раза в сутки (Stories живут 24 часа)
export async function runStoriesSync(): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = [];
  let ok = true;
  const accounts = await getAccounts();
  await mapPool(accounts, 3, async (a) => {
    try {
      const r = await syncStories(a);
      log.push(`@${a.username}: активных stories ${r.active}`);
    } catch (e: any) {
      ok = false;
      log.push(`@${a.username}: ОШИБКА: ${e?.message || e}`);
    }
  });
  return { ok, log };
}
