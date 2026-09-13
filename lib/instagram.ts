// Обёртка над Instagram Graph API.
//
// ВАЖНО: Meta периодически меняет названия метрик в Insights API.
// Если какой-то запрос начнёт возвращать ошибку вида
// "(#100) metric[0] must be one of the following values: ..." —
// это значит Meta переименовала метрику. Сообщение об ошибке само
// подскажет актуальный список названий, нужно будет поправить
// константы METRICS_ACCOUNT / METRICS_POST / METRICS_STORY ниже.

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type Account = {
  id: string; // Instagram Business Account ID
  username: string;
  display_name: string;
  page_id: string;
};

const METRICS_ACCOUNT = ["reach", "profile_views", "follower_count"];
const METRICS_STORY = ["reach", "replies", "exits"];

function getAccounts(): Account[] {
  const raw = process.env.IG_ACCOUNTS;
  if (!raw) throw new Error("Не задана переменная окружения IG_ACCOUNTS");
  return JSON.parse(raw);
}

function getToken(): string {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) throw new Error("Не задана переменная окружения IG_ACCESS_TOKEN");
  return token;
}

async function graphGet(path: string, params: Record<string, string>) {
  const token = getToken();
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      `Graph API error at ${path}: ${data.error?.message || res.statusText}`
    );
  }
  return data;
}

export function listAccounts(): Account[] {
  return getAccounts();
}

// Дневные метрики по аккаунту за сегодня
export async function fetchAccountDailyInsights(account: Account) {
  const data = await graphGet(`/${account.id}/insights`, {
    metric: METRICS_ACCOUNT.join(","),
    period: "day",
    metric_type: "total_value",
  });
  const result: Record<string, number> = {};
  for (const item of data.data || []) {
    const value =
      item.total_value?.value ?? item.values?.[item.values.length - 1]?.value ?? 0;
    result[item.name] = value;
  }
  return result;
}

// Последние N постов аккаунта с базовыми полями
export async function fetchRecentMedia(account: Account, limit = 25) {
  const data = await graphGet(`/${account.id}/media`, {
    fields:
      "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return data.data || [];
}

// Постраничная выгрузка ВСЕХ постов аккаунта — для разовой подгрузки истории.
// Используется только эндпоинтом backfill, не ежедневным сбором (иначе слишком
// медленно и не нужно каждый день перечитывать весь архив).
export async function fetchAllMediaPage(account: Account, after?: string) {
  const params: Record<string, string> = {
    fields:
      "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: "50",
  };
  if (after) params.after = after;

  const data = await graphGet(`/${account.id}/media`, params);
  return {
    items: data.data || [],
    nextCursor: data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : null,
  };
}

// Инсайты одного поста (охват, сохранения, шеринги)
export async function fetchMediaInsights(mediaId: string, mediaType: string) {
  // Reels используют другой набор метрик, чем обычные фото/карусели
  const isReel = mediaType === "VIDEO" || mediaType === "REELS";
  const metrics = isReel ? ["reach", "saved", "shares"] : ["reach", "saved", "shares"];
  try {
    const data = await graphGet(`/${mediaId}/insights`, {
      metric: metrics.join(","),
    });
    const result: Record<string, number> = {};
    for (const item of data.data || []) {
      result[item.name] = item.values?.[0]?.value ?? 0;
    }
    return result;
  } catch (e) {
    // Некоторые старые посты могут не отдавать инсайты — не роняем весь сбор
    return {};
  }
}

// Активные (ещё не исчезнувшие) Stories аккаунта
export async function fetchActiveStories(account: Account) {
  const data = await graphGet(`/${account.id}/stories`, {
    fields: "id,timestamp,media_type",
  });
  return data.data || [];
}

export async function fetchStoryInsights(storyId: string) {
  try {
    const data = await graphGet(`/${storyId}/insights`, {
      metric: METRICS_STORY.join(","),
    });
    const result: Record<string, number> = {};
    for (const item of data.data || []) {
      result[item.name] = item.values?.[0]?.value ?? 0;
    }
    return result;
  } catch (e) {
    return {};
  }
}
