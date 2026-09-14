import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { listAccounts, fetchAllMediaPage, fetchMediaInsights } from "@/lib/instagram";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });
  }

  const supabase = getSupabase();
  const accounts = listAccounts();
  const log: string[] = [];

  for (const account of accounts) {
    await supabase.from("accounts").upsert({
      id: account.id,
      username: account.username,
      display_name: account.display_name,
      page_id: account.page_id,
    });

    let after: string | undefined = undefined;
    let total = 0;
    let pageCount = 0;

    do {
      const { items, nextCursor } = await fetchAllMediaPage(account, after);
      for (const m of items) {
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
        total++;
      }
      after = nextCursor || undefined;
      pageCount++;
    } while (after && pageCount < 40);

    log.push(`${account.username}: загружено постов — ${total}`);
  }

  return NextResponse.json({ ok: true, log });
}
