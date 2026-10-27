import { NextRequest, NextResponse } from "next/server";
import { loadYtHistory, updateYtChannel } from "@/lib/ytcollector";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/yt/sync
// { channel, action: "update" }           — обновить канал сейчас (все видео и аналитика)
// { channel, action: "history", cursor }  — порция архива видео, ответ содержит nextCursor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "update") {
      return NextResponse.json({ ok: true, log: [await updateYtChannel(String(body.channel))] });
    }
    if (body.action === "history") {
      return NextResponse.json({ ok: true, ...(await loadYtHistory(String(body.channel), body.cursor || null)) });
    }
    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e);
  }
}
