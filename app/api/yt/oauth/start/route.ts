import { NextRequest, NextResponse } from "next/server";
import { googleSecret, oauthUrl, ytStatus } from "@/lib/youtube";
import { signState } from "@/lib/secretbox";
import { siteOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/yt/oauth/start -> страница входа Google (аналитика своего канала)
export async function GET(req: NextRequest) {
  if (!ytStatus().oauth) {
    return NextResponse.redirect(new URL("/dashboard?v=settings&yt=error&msg=Не заданы GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET", siteOrigin(req)));
  }
  return NextResponse.redirect(oauthUrl(siteOrigin(req), signState(googleSecret())));
}
