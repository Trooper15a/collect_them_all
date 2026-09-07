import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addToWishlist, listWishlist, removeFromWishlist } from "@/lib/wishlist";
import { requireUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await requireUserId();
    const items = await listWishlist(userId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("wishlist GET error", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

const AddSchema = z.object({
  cardId: z.string().min(1),
  targetPrice: z.number().positive().optional(),
  targetCurrency: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = AddSchema.parse(body);
    const userId = await requireUserId();
    const item = await addToWishlist(userId, data.cardId, data.targetPrice, data.targetCurrency);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    console.error("wishlist POST error", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

const DeleteSchema = z.object({ cardId: z.string().min(1) });

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const data = DeleteSchema.parse(body);
    const userId = await requireUserId();
    await removeFromWishlist(userId, data.cardId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    console.error("wishlist DELETE error", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
