import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fail, parseAccount } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/audience?account=ID -> последний срез аудитории подписчиков
export async function GET(req: NextRequest) {
  try {
    const account = parseAccount(req);
    if (!account) return fail("Укажите аккаунт", 400);
    const { data, error } = await getSupabase()
      .from("account_audience")
      .select("*")
      .eq("account_id", account)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ audience: data });
  } catch (e) {
    return fail(e);
  }
}
