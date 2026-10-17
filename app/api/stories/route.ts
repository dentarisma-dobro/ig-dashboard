import { NextRequest, NextResponse } from "next/server";
import { getSupabase, selectAll } from "@/lib/supabase";
import { fail, parseAccount, parseRange } from "@/lib/api";
import { addDays, LOCAL_TZ, midnightUtc } from "@/lib/dates";

export const dynamic = "force-dynamic";

// GET /api/stories?account=ID|all&from&to -> Stories, опубликованные за период
export async function GET(req: NextRequest) {
  try {
    const range = parseRange(req);
    const account = parseAccount(req);
    const since = new Date(midnightUtc(range.from, LOCAL_TZ)).toISOString();
    const until = new Date(midnightUtc(addDays(range.to, 1), LOCAL_TZ)).toISOString();
    const sb = getSupabase();
    const stories = await selectAll((from, to) => {
      let q = sb
        .from("stories")
        .select("*")
        .gte("posted_at", since)
        .lt("posted_at", until)
        .order("posted_at", { ascending: false })
        .range(from, to);
      if (account) q = q.eq("account_id", account);
      return q;
    });
    return NextResponse.json({ ...range, stories });
  } catch (e) {
    return fail(e);
  }
}
