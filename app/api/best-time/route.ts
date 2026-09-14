import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// Анализирует накопленные посты: считает среднюю вовлечённость
// (лайки+комментарии+сохранения+репосты) по часу и дню недели публикации.
// Чем больше накопится постов со временем, тем точнее результат —
// на малом числе постов (первые недели) картина может быть случайной.
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account");
  const supabase = getSupabase();

  let query = supabase.from("posts").select("posted_at, likes, comments, saved, shares");
  if (accountId) query = query.eq("account_id", accountId);

  const { data: posts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets: Record<string, { total: number; count: number }> = {};

  for (const p of posts || []) {
    const d = new Date(p.posted_at);
    const day = DAYS[d.getDay()];
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    const engagement = (p.likes || 0) + (p.comments || 0) + (p.saved || 0) + (p.shares || 0);
    if (!buckets[key]) buckets[key] = { total: 0, count: 0 };
    buckets[key].total += engagement;
    buckets[key].count += 1;
  }

  const result = Object.entries(buckets)
    .map(([key, v]) => {
      const [day, hour] = key.split("-");
      return { day, hour: Number(hour), avgEngagement: v.total / v.count, postsCount: v.count };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  return NextResponse.json({
    slots: result.slice(0, 10),
    totalPostsAnalyzed: posts?.length || 0,
    reliable: (posts?.length || 0) >= 20,
  });
}
