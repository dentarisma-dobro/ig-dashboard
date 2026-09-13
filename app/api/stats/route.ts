import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/stats?days=30  -> временной ряд по ВСЕМ аккаунтам за N дней,
// удобно для сравнения аккаунтов на одном графике.
export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") || "30");
  const supabase = getSupabase();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("daily_account_stats")
    .select("*, accounts(username, display_name)")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stats: data });
}
