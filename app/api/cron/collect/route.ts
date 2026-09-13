import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  listAccounts,
  fetchAccountDailyInsights,
  fetchRecentMedia,
  fetchMediaInsights,
  fetchActiveStories,
  fetchStoryInsights,
} from "@/lib/instagram";

// Этот эндпоинт вызывается автоматически Vercel Cron раз в день (см. vercel.json).
// Можно также вызвать его вручную, открыв URL в браузере с правильным секретом —
// удобно для проверки, что всё работает, не дожидаясь расписания.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });
  }

  const supabase = getSupabase();
  const accounts = listAccounts();
  const today = new Date().toISOString().slice(0, 10);
  const log: string[] = [];

  for (const account of accounts) {
    try {
      // 1. Убедимся, что аккаунт есть в таблице accounts
      await supabase.from("accounts").upsert({
        id: account.id,
        username: account.username,
        display_name: account.display_name,
        page_id: account.page_id,
      });

      // 2. Дневные метрики по аккаунту
      const insights = await fetchAccountDailyInsights(account);
      await supabase.from("daily_account_stats").upsert(
        {
          account_id: account.id,
          date: today,
          reach: insights.reach || 0,
          impressions: insights.impressions || 0,
          follower_count: insights.follower_count || 0,
          profile_views: insights.profile_views || 0,
        },
        { onConflict: "account_id,date" }
      );
      log.push(`${account.username}: дневные метрики сохранены`);

      // 3. Посты и их метрики
      const media = await fetchRecentMedia(account, 25);
      for (const m of media) {
        const mi = await fetchMediaInsights(m.id, m.media_type);
        await supabase.from("posts").upsert({
          id: m.id,
          account_id: account.id,
          media_type: m.media_type,
          caption: m.caption || "",
          permalink: m.permalink,
          thumbnail_url: m.thumbnail_url || m.media_url,
          posted_at: m.timestamp,
          likes: m.like_count || 0,
          comments: m.comments_count || 0,
          saved: mi.saved || 0,
          shares: mi.shares || 0,
          reach: mi.reach || 0,
        });
      }
      log.push(`${account.username}: постов обновлено ${media.length}`);

      // 4. Активные Stories (успеть собрать метрики до истечения 24 часов)
      const stories = await fetchActiveStories(account);
      for (const s of stories) {
        const si = await fetchStoryInsights(s.id);
        await supabase.from("stories").upsert({
          id: s.id,
          account_id: account.id,
          posted_at: s.timestamp,
          reach: si.reach || 0,
          impressions: si.impressions || 0,
          replies: si.replies || 0,
          exits: si.exits || 0,
        });
      }
      log.push(`${account.username}: stories собрано ${stories.length}`);
    } catch (err: any) {
      log.push(`${account.username}: ОШИБКА — ${err.message}`);
    }
  }

  return NextResponse.json({ ok: true, log });
}
