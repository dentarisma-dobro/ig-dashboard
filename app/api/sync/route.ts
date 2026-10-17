import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  finishRun,
  getAccount,
  startRun,
  syncAudience,
  syncDaily,
  syncMedia,
  syncProfile,
  updateAccount,
} from "@/lib/collector";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ручной сбор статистики из раздела «Настройки». Закрыт паролем сайта (middleware.ts).
// POST { account, action }
//   action "update"        — то же, что ежедневный cron, для одного аккаунта
//   action "history-daily" — дневная статистика за 30 дней (максимум, который хранит Instagram)
//   action "history-media" — одна страница архива публикаций (25 штук), ответ содержит nextCursor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const account = await getAccount(String(body.account));

    if (body.action === "update") {
      const runId = await startRun("manual");
      const log: string[] = [];
      const ok = await updateAccount(account, log);
      await finishRun(runId, ok, log);
      return NextResponse.json({ ok, log });
    }

    if (body.action === "history-daily") {
      const profile = await syncProfile(account);
      const r = await syncDaily(account, 30, profile);
      await syncAudience(account, true);
      return NextResponse.json({ ok: true, log: [`@${account.username}: статистика по дням за ${r.days} дн.`] });
    }

    if (body.action === "history-media") {
      const r = await syncMedia(account, { mode: "page", cursor: body.cursor || undefined });
      return NextResponse.json({ ok: true, ...r });
    }

    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e);
  }
}

// GET /api/sync -> журнал последних сборов
export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return NextResponse.json({ runs: data || [] });
  } catch (e) {
    return fail(e);
  }
}
