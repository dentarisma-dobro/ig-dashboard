import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/posts?account=ID&limit=25
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "25");
  const supabase = getSupabase();

  let query = supabase
    .from("posts")
    .select("*, accounts(username, display_name)")
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}
