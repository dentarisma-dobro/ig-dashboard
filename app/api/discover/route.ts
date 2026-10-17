import { NextResponse } from "next/server";
import { fetchAvailableAccounts } from "@/lib/instagram";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/discover -> Instagram-аккаунты, доступные токену (для раздела «Настройки»)
export async function GET() {
  try {
    const accounts = await fetchAvailableAccounts();
    return NextResponse.json({ accounts });
  } catch (e) {
    return fail(e);
  }
}
