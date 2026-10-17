import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { addAccount, getAccounts } from "@/lib/collector";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/accounts -> все аккаунты (и отключённые) + последний сбор статистики
export async function GET() {
  try {
    const accounts = await getAccounts(true);
    const { data: runs } = await getSupabase()
      .from("sync_runs")
      .select("id,source,started_at,finished_at,ok")
      .order("started_at", { ascending: false })
      .limit(1);
    return NextResponse.json({ accounts, lastRun: runs?.[0] ?? null });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/accounts
// { action: "add", id }                    — начать отслеживать аккаунт
// { action: "toggle", id, is_active }      — включить или выключить сбор
// { action: "rename", id, display_name }   — название на сайте
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = getSupabase();
    if (body.action === "add") {
      const account = await addAccount(String(body.id));
      return NextResponse.json({ account });
    }
    if (body.action === "toggle") {
      const { error } = await sb.from("accounts").update({ is_active: !!body.is_active }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "rename") {
      const name = String(body.display_name || "").trim();
      if (!name) return fail("Пустое название", 400);
      const { error } = await sb.from("accounts").update({ display_name: name }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    return fail("Неизвестное действие", 400);
  } catch (e) {
    return fail(e);
  }
}
