import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { runStoriesSync } from "@/lib/collector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Сбор только Stories. Stories живут 24 часа, а Vercel на бесплатном тарифе запускает
// каждое cron-задание раз в сутки, поэтому в vercel.json этот адрес стоит трижды
// на разные часы. Вместе с основным сбором получается замер примерно раз в 6 часов.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });
  }
  const result = await runStoriesSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
