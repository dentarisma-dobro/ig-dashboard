import { NextRequest, NextResponse } from "next/server";
import { loadTgHistory, updateTgChannel } from "@/lib/tgcollector";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/tg/sync
// { channel, action: "update" }            — обновить канал сейчас (со статистикой Telegram)
// { channel, action: "history", cursor }   — порция архива постов, ответ содержит nextCursor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "update") {
      return NextResponse.json({ ok: true, log: [await updateTgChannel(String(body.channel))] });
    }
    if (body.action === "history") {
      const cursor = body.cursor == null ? null : Number(body.cursor);
      return NextResponse.json({ ok: true, ...(await loadTgHistory(String(body.channel), cursor)) });
    }
    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e);
  }
}
