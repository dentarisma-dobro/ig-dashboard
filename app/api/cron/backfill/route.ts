import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { getAccounts, syncDaily, syncMedia, syncProfile } from "@/lib/collector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Загрузка истории без входа на сайт (удобнее кнопка в разделе «Настройки»).
// Каждый вызов работает до 40 секунд и отвечает, где остановился:
//   /api/cron/backfill?secret=СЕКРЕТ
//   /api/cron/backfill?secret=СЕКРЕТ&account=ID&cursor=КУРСОР  (продолжение из ответа)
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });
  }
  const started = Date.now();
  const params = req.nextUrl.searchParams;
  const accounts = await getAccounts();
  let index = Math.max(0, accounts.findIndex((a) => a.id === params.get("account")));
  let cursor = params.get("cursor") || undefined;
  const log: string[] = [];

  try {
    while (index < accounts.length && Date.now() - started < 40000) {
      const account = accounts[index];
      if (!cursor) {
        const profile = await syncProfile(account);
        await syncDaily(account, 30, profile);
        log.push(`@${account.username}: статистика по дням за 30 дн.`);
      }
      const r = await syncMedia(account, { mode: "page", cursor });
      log.push(`@${account.username}: публикаций +${r.processed}`);
      if (r.nextCursor) {
        cursor = r.nextCursor;
      } else {
        index++;
        cursor = undefined;
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e), log }, { status: 500 });
  }

  const done = index >= accounts.length;
  return NextResponse.json({
    ok: true,
    done,
    log,
    next: done
      ? null
      : `/api/cron/backfill?account=${accounts[index].id}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  });
}
