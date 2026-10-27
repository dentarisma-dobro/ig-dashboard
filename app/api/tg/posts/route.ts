import { NextRequest, NextResponse } from "next/server";
import { getSupabase, selectAll } from "@/lib/supabase";
import { fail, parseRange } from "@/lib/api";
import { addDays, LOCAL_TZ, midnightUtc } from "@/lib/dates";

export const dynamic = "force-dynamic";

// GET /api/tg/posts?channel=ID|all&from&to -> посты за период и за предыдущий период (по Москве)
export async function GET(req: NextRequest) {
  try {
    const range = parseRange(req);
    const ch = req.nextUrl.searchParams.get("channel");
    const channel = ch && ch !== "all" ? ch : null;
    const since = new Date(midnightUtc(range.prevFrom, LOCAL_TZ)).toISOString();
    const until = new Date(midnightUtc(addDays(range.to, 1), LOCAL_TZ)).toISOString();
    const sb = getSupabase();
    const posts = await selectAll((from, to) => {
      let q = sb
        .from("tg_posts")
        .select("channel_id,msg_id,posted_at,text,media_type,views,forwards,reactions,comments,views_24h")
        .gte("posted_at", since)
        .lt("posted_at", until)
        .order("posted_at", { ascending: false })
        .range(from, to);
      if (channel) q = q.eq("channel_id", channel);
      return q;
    });
    return NextResponse.json({ ...range, posts });
  } catch (e) {
    return fail(e);
  }
}
