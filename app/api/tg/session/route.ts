import { NextRequest, NextResponse } from "next/server";
import { finishLogin, logout, sessionStatus, startLogin } from "@/lib/telegram";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/tg/session -> подключён ли аккаунт Telegram
export async function GET() {
  try {
    return NextResponse.json(await sessionStatus());
  } catch (e) {
    return fail(e);
  }
}

// POST /api/tg/session
// { action: "start", phone }     — Telegram присылает код
// { action: "code", code }       — ввод кода
// { action: "password", password } — облачный пароль, если включён
// { action: "logout" }           — выйти из аккаунта
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "start") return NextResponse.json(await startLogin(String(body.phone || "")));
    if (body.action === "code") return NextResponse.json(await finishLogin({ code: body.code }));
    if (body.action === "password") return NextResponse.json(await finishLogin({ password: body.password }));
    if (body.action === "logout") {
      await logout();
      return NextResponse.json({ ok: true });
    }
    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e, 400);
  }
}
