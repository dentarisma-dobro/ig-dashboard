import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/stats?days=30  ИЛИ  /api/stats?from=2026-08-01&to=2026-09-01
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const days = Number(req.nextUrl.searchParams.get("days") || "30");
  const supabase = getSupabase();

  let sinceStr: string;
  let untilStr: string;

  if (from && to) {
    sinceStr = from;
    untilStr = to;
  } else {
    const since = new Date();
    since.setDate(since.getDate() - days);
    sinceStr = since.toISOString().slice(0, 10);
    untilStr = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabase
    .from("daily_account_stats")
    .select("*, accounts(username, display_name)")
    .gte("date", sinceStr)
    .lte("date", untilStr)
    .order("date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stats: data });
}
