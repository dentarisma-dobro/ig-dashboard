import { NextRequest, NextResponse } from "next/server";
import { addDays, diffDays, lastCompleteMetaDay } from "./dates";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST_COLUMNS =
  "id,account_id,media_type,media_product_type,caption,permalink,thumb_url,posted_at,likes,comments,saved,shares,reach,views,total_interactions,profile_visits,follows,reposts,avg_watch_time_ms,total_watch_time_ms,insights_updated_at";

// Период из ?from=YYYY-MM-DD&to=YYYY-MM-DD плюс такой же предыдущий период для сравнения
export function parseRange(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  let to = p.get("to") || "";
  let from = p.get("from") || "";
  if (!DATE_RE.test(to)) to = lastCompleteMetaDay();
  if (!DATE_RE.test(from)) from = addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  const len = diffDays(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  return { from, to, prevFrom, prevTo };
}

// ?account=ID или ?account=all (или пусто) — все аккаунты
export function parseAccount(req: NextRequest): string | null {
  const a = req.nextUrl.searchParams.get("account");
  return a && a !== "all" ? a : null;
}

export function fail(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}
