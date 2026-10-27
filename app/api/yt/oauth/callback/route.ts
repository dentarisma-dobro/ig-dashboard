import { NextRequest, NextResponse } from "next/server";
import { googleSecret } from "@/lib/youtube";
import { verifyState } from "@/lib/secretbox";
import { linkGoogle } from "@/lib/ytcollector";
import { siteOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Google возвращает сюда владельца канала после входа
export async function GET(req: NextRequest) {
  const base = siteOrigin(req);
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/dashboard?v=settings&${new URLSearchParams(params).toString()}`, base));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back({ yt: "error", msg: p.get("error") === "access_denied" ? "Вход отменён" : String(p.get("error")) });
  const code = p.get("code");
  const state = p.get("state") || "";
  if (!code || !verifyState(state, googleSecret())) return back({ yt: "error", msg: "Ссылка входа устарела, попробуйте ещё раз" });
  try {
    const channels = await linkGoogle(code, base);
    return back({ yt: "linked", msg: channels.map((c) => c.title).join(", ") });
  } catch (e: any) {
    return back({ yt: "error", msg: e?.message || String(e) });
  }
}
