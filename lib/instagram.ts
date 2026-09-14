// Обёртка над Instagram Graph API.
//
// ВАЖНО: Meta периодически меняет названия метрик в Insights API.
// Если какой-то запрос начнёт возвращать ошибку вида
// "(#100) metric[0] must be one of the following values: ..." —
// это значит Meta переименовала метрику. Сообщение об ошибке само
// подскажет актуальный список названий.

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type Account = {
  id: string;
  username: string;
  display_name: string;
  page_id: string;
};

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

// Дневные метрики по аккаунту: охват/визиты (total_value), подписчики
// (отдельный формат) и клики по кнопкам связи (тоже total_value, но
// отдельным запросом, т.к. доступны не всем аккаунтам — не должны
// ронять остальные метрики, если недоступны).
export async function fetchAccountDailyInsights(account: Account) {
  const result: Record<string, number> = {};

  try {
    const totalValueMetrics = await graphGet(`/${account.id}/insights`, {
      metric: "reach,profile_views",
      period: "day",
      metric_type: "total_value",
    });
    for (const item of totalValueMetrics.data || []) {
      result[item.name] = item.total_value?.value ?? 0;
    }
  } catch (e) {
    // не роняем весь сбор, если поменяется состав этих метрик
  }

  try {
    const followerData = await graphGet(`/${account.id}/insights`, {
      metric: "follower_count",
      period: "day",
    });
    const item = followerData.data?.[0];
    result.follower_count = item?.values?.[item.values.length - 1]?.value ?? 0;
  } catch (e) {
    // follower_count иногда недоступен в первые дни после подключения аккаунта
  }

  try {
    const ctaMetrics = await graphGet(`/${account.id}/insights`, {
      metric:
        "website_clicks,phone_call_clicks,text_message_clicks,email_contacts,get_directions_clicks",
      period: "day",
      metric_type: "total_value",
    });
    for (const item of ctaMetrics.data || []) {
      result[item.name] = item.total_value?.value ?? 0;
    }
  } catch (e) {
    // доступно только если в профиле настроены кнопки связи — не критично
  }

  return result;
}

export async function fetchRecentMedia(account: Account, limit = 25) {
  const data = await graphGet(`/${account.id}/media`, {
    fields:
      "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return data.data || [];
}

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
    nextCursor:
      data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : null,
  };
}

export async function fetchMediaInsights(mediaId: string, mediaType: string) {
  const metrics = ["reach", "saved", "shares"];
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
    return {};
  }
}

export async function fetchActiveStories(account: Account) {
  const data = await graphGet(`/${account.id}/stories`, {
    fields: "id,timestamp,media_type",
  });
  return data.data || [];
}

export async function fetchStoryInsights(storyId: string) {
  try {
    const data = await graphGet(`/${storyId}/insights`, {
      metric: "reach,replies,exits",
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
