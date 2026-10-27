import { NextRequest, NextResponse } from "next/server";
import { getSupabase, selectAll } from "@/lib/supabase";
import { fail, parseRange } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/yt/stats?channel=ID|all&from&to
// -> каналы по дням за период и за предыдущий такой же период,
//    для одного канала ещё последняя сводка разбивок аналитики (источники, аудитория, страны)
export async function GET(req: NextRequest) {
  try {
    const range = parseRange(req);
    const ch = req.nextUrl.searchParams.get("channel");
    const channel = ch && ch !== "all" ? ch : null;
    const sb = getSupabase();
    const rows = await selectAll((from, to) => {
      let q = sb
        .from("yt_channel_daily")
        .select("*")
        .gte("date", range.prevFrom)
        .lte("date", range.to)
        .order("date")
        .range(from, to);
      if (channel) q = q.eq("channel_id", channel);
      return q;
    });
    let summary = null;
    if (channel) {
      const { data } = await sb
        .from("yt_channel_stats")
        .select("date,data")
        .eq("channel_id", channel)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      summary = data;
    }
    return NextResponse.json({ ...range, rows, summary });
  } catch (e) {
    return fail(e);
  }
}
