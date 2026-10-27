import { NextRequest, NextResponse } from "next/server";
import { getSupabase, selectAll } from "@/lib/supabase";
import { fail, parseRange } from "@/lib/api";
import { addDays, LOCAL_TZ, midnightUtc } from "@/lib/dates";

export const dynamic = "force-dynamic";

// GET /api/yt/videos?channel=ID|all&from&to -> видео за период и за предыдущий период (по Москве)
export async function GET(req: NextRequest) {
  try {
    const range = parseRange(req);
    const ch = req.nextUrl.searchParams.get("channel");
    const channel = ch && ch !== "all" ? ch : null;
    const since = new Date(midnightUtc(range.prevFrom, LOCAL_TZ)).toISOString();
    const until = new Date(midnightUtc(addDays(range.to, 1), LOCAL_TZ)).toISOString();
    const sb = getSupabase();
    const videos = await selectAll((from, to) => {
      let q = sb
        .from("yt_videos")
        .select(
          "id,channel_id,published_at,title,duration_sec,is_short,thumb_url,views,likes,comments,views_24h,views_7d,watch_minutes,avg_view_duration,avg_view_percentage,subs_gained,shares,impressions,impressions_ctr"
        )
        .gte("published_at", since)
        .lt("published_at", until)
        .order("published_at", { ascending: false })
        .range(from, to);
      if (channel) q = q.eq("channel_id", channel);
      return q;
    });
    return NextResponse.json({ ...range, videos });
  } catch (e) {
    return fail(e);
  }
}
