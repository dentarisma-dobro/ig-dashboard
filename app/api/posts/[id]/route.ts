import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fail, POST_COLUMNS } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/posts/ID -> публикация, её подпись целиком и ежедневные снимки метрик
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabase();
    const { data: post, error } = await sb
      .from("posts")
      .select(POST_COLUMNS)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) return fail("Публикация не найдена", 404);
    const { data: history, error: e2 } = await sb
      .from("post_daily")
      .select("date,likes,comments,saved,shares,reach,views,total_interactions")
      .eq("post_id", params.id)
      .order("date");
    if (e2) throw new Error(e2.message);
    return NextResponse.json({ post, history: history || [] });
  } catch (e) {
    return fail(e);
  }
}
