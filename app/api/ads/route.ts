import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account");
  const supabase = getSupabase();

  let query = supabase.from("ad_campaigns").select("*").order("start_date", {
    ascending: false,
  });
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ads: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("ad_campaigns")
    .insert({
      account_id: body.account_id,
      title: body.title,
      start_date: body.start_date,
      end_date: body.end_date,
      budget: body.budget || null,
      result_note: body.result_note || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ad: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не передан id" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase.from("ad_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
