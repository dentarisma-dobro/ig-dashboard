import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { addTgChannel, getTgChannels } from "@/lib/tgcollector";
import { sessionStatus } from "@/lib/telegram";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/tg/channels -> каналы (и выключенные) + состояние подключения аккаунта
export async function GET() {
  try {
    const [channels, session] = await Promise.all([getTgChannels(true), sessionStatus()]);
    return NextResponse.json({ channels, session });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/tg/channels
// { action: "add", link, is_own }        — добавить канал по ссылке или @username
// { action: "toggle", id, is_active }    — включить или выключить сбор
// { action: "own", id, is_own }          — свой канал или конкурент
// { action: "remove", id }               — удалить канал и его статистику
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = getSupabase();
    if (body.action === "add") {
      const channel = await addTgChannel(String(body.link || ""), !!body.is_own);
      return NextResponse.json({ channel });
    }
    if (body.action === "toggle" || body.action === "own") {
      const patch = body.action === "toggle" ? { is_active: !!body.is_active } : { is_own: !!body.is_own };
      const { error } = await sb.from("tg_channels").update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove") {
      await sb.from("tg_post_snapshots").delete().eq("channel_id", body.id);
      const { error } = await sb.from("tg_channels").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e, 400);
  }
}
