import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

const startedAt = Date.now();

export async function GET() {
  try {
    // Auth.js selects every users column during Google sign-in. Catch schema drift here.
    await db.execute(sql`SELECT premium, stripe_customer_id, premium_since FROM users LIMIT 0`);
    return NextResponse.json({
      status: "ok",
      db: true,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  } catch {
    return NextResponse.json(
      { status: "error", db: false, uptime: Math.floor((Date.now() - startedAt) / 1000) },
      { status: 503 },
    );
  }
}
