import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { videoRetention } from "@/lib/ytcollector";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/yt/video/ID -> видео, замеры просмотров и удержание аудитории (если канал подключён)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabase();
    const { data: video, error } = await sb.from("yt_videos").select("*").eq("id", params.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!video) return fail("Видео не найдено", 404);
    const { data: snapshots } = await sb
      .from("yt_video_snapshots")
      .select("captured_at,views,likes,comments")
      .eq("video_id", params.id)
      .order("captured_at");
    let retention = null;
    let retentionError: string | null = null;
    try {
      retention = await videoRetention(params.id);
    } catch (e: any) {
      retentionError = e?.message || String(e);
    }
    return NextResponse.json({ video, snapshots: snapshots || [], retention, retentionError });
  } catch (e) {
    return fail(e);
  }
}
