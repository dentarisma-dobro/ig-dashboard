import { NextRequest, NextResponse } from "next/server";

// Простая защита паролем на весь сайт, кроме страницы логина,
// самого API логина и cron-эндпоинта (у него своя защита секретом в URL).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  const authCookie = req.cookies.get("site_auth")?.value;
  if (authCookie === process.env.SITE_PASSWORD) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
