import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET возвращает список конкурентов вместе с их снимками показателей
export async function GET() {
  const supabase = getSupabase();
  const { data: competitors, error } = await supabase
    .from("competitors")
    .select("*")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withSnapshots = await Promise.all(
    (competitors || []).map(async (c) => {
      const { data: snapshots } = await supabase
        .from("competitor_snapshots")
        .select("*")
        .eq("competitor_id", c.id)
        .order("date", { ascending: false })
        .limit(20);
      return { ...c, snapshots: snapshots || [] };
    })
  );

  return NextResponse.json({ competitors: withSnapshots });
}

// POST с полем "type": "competitor" создаёт нового конкурента,
// с "type": "snapshot" — добавляет запись показателей на дату.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = getSupabase();

  if (body.type === "competitor") {
    const { data, error } = await supabase
      .from("competitors")
      .insert({ name: body.name, username: body.username || null, notes: body.notes || null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competitor: data });
  }

  if (body.type === "snapshot") {
    const { data, error } = await supabase
      .from("competitor_snapshots")
      .insert({
        competitor_id: body.competitor_id,
        date: body.date,
        followers: body.followers || null,
        top_post_url: body.top_post_url || null,
        top_post_note: body.top_post_note || null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ snapshot: data });
  }

  return NextResponse.json({ error: "Неизвестный type" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type") || "competitor";
  if (!id) return NextResponse.json({ error: "Не передан id" }, { status: 400 });
  const supabase = getSupabase();
  const table = type === "snapshot" ? "competitor_snapshots" : "competitors";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
