import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { runScheduledSync } from "@/lib/collector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ежедневный сбор статистики. Его вызывает Vercel Cron (см. vercel.json)
// с заголовком Authorization: Bearer <CRON_SECRET>.
// Вручную: https://ваш-сайт.vercel.app/api/cron/collect?secret=ВАШ_CRON_SECRET
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });
  }
  const result = await runScheduledSync("cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
