import { NextRequest, NextResponse } from "next/server";
import { acknowledgeAlert, deleteAlert } from "@/lib/alerts";
import { requireUserId } from "@/lib/auth";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const row = await acknowledgeAlert(userId, id);
    if (!row) return NextResponse.json({ error: "Not found or watch changed; reload and try again" }, { status: 404 });
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reset alert" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await deleteAlert(userId, id);
  return NextResponse.json({ ok: true });
}
