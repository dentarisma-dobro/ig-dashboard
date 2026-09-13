import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/stories?account=ID&days=30
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account");
  const days = Number(req.nextUrl.searchParams.get("days") || "30");
  const supabase = getSupabase();

  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = supabase
    .from("stories")
    .select("*, accounts(username, display_name)")
    .gte("posted_at", since.toISOString())
    .order("posted_at", { ascending: false });

  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stories: data });
}
