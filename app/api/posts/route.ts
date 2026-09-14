import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/posts?account=ID&limit=60&from=2026-08-01&to=2026-09-14
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "60");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const supabase = getSupabase();

  let query = supabase
    .from("posts")
    .select("*, accounts(username, display_name)")
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (accountId) query = query.eq("account_id", accountId);
  if (from) query = query.gte("posted_at", from);
  if (to) query = query.lte("posted_at", `${to}T23:59:59`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}
