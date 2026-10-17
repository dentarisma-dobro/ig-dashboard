// В cookie хранится не сам пароль, а его хэш: так пароль не утечёт из браузера.
// Работает и в middleware (Edge), и в API-роутах (Node).

export const AUTH_COOKIE = "site_auth";

export async function authToken(): Promise<string | null> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return null;
  const data = new TextEncoder().encode(`ig-dashboard:v2:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Cron-эндпоинты: Vercel Cron присылает заголовок "Authorization: Bearer <CRON_SECRET>",
// для ручного запуска из браузера подходит ?secret=<CRON_SECRET>
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}
