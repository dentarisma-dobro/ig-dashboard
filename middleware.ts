import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

// Защита паролем на весь сайт, кроме страницы логина, API логина
// и cron-эндпоинтов (у них своя защита секретом).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  const expected = await authToken();
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (expected && cookie === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/).*)"],
};
