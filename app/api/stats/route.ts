import { NextRequest, NextResponse } from "next/server";
import { getSupabase, selectAll } from "@/lib/supabase";
import { fail, parseAccount, parseRange } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/stats?account=ID|all&from=YYYY-MM-DD&to=YYYY-MM-DD
// -> дневная статистика за период и за такой же предыдущий период (для сравнения)
export async function GET(req: NextRequest) {
  try {
    const range = parseRange(req);
    const account = parseAccount(req);
    const sb = getSupabase();
    const rows = await selectAll((from, to) => {
      let q = sb
        .from("account_daily")
        .select("*")
        .gte("date", range.prevFrom)
        .lte("date", range.to)
        .order("date")
        .range(from, to);
      if (account) q = q.eq("account_id", account);
      return q;
    });
    return NextResponse.json({ ...range, rows });
  } catch (e) {
    return fail(e);
  }
}
