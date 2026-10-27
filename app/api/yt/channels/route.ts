import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { addYtChannel, getYtChannels, unlinkGoogle } from "@/lib/ytcollector";
import { ytStatus } from "@/lib/youtube";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/yt/channels -> каналы YouTube (и выключенные) + заданы ли ключи Google
export async function GET() {
  try {
    const status = ytStatus();
    const channels = await getYtChannels(true);
    return NextResponse.json({ channels, status });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/yt/channels
// { action: "add", link, is_own }       — добавить канал по ссылке, @handle или ID
// { action: "toggle", id, is_active }   — включить или выключить сбор
// { action: "own", id, is_own }         — свой канал или конкурент
// { action: "unlink", id }              — отключить аналитику (забыть вход Google)
// { action: "remove", id }              — удалить канал и его статистику
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = getSupabase();
    if (body.action === "add") {
      return NextResponse.json({ channel: await addYtChannel(String(body.link || ""), !!body.is_own) });
    }
    if (body.action === "toggle" || body.action === "own") {
      const patch = body.action === "toggle" ? { is_active: !!body.is_active } : { is_own: !!body.is_own };
      const { error } = await sb.from("yt_channels").update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "unlink") {
      await unlinkGoogle(String(body.id));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove") {
      const { data: vids } = await sb.from("yt_videos").select("id").eq("channel_id", body.id);
      const ids = (vids || []).map((v: any) => v.id);
      for (let i = 0; i < ids.length; i += 200) await sb.from("yt_video_snapshots").delete().in("video_id", ids.slice(i, i + 200));
      const { error } = await sb.from("yt_channels").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e, 400);
  }
}
