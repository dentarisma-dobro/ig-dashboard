import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*")
    .order("display_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Подтягиваем последний доступный срез метрик по каждому аккаунту
  const withLatest = await Promise.all(
    (accounts || []).map(async (acc) => {
      const { data: latest } = await supabase
        .from("daily_account_stats")
        .select("*")
        .eq("account_id", acc.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...acc, latest };
    })
  );

  return NextResponse.json({ accounts: withLatest });
}
