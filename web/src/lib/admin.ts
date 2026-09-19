import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { auth } from "./auth";

// Preserve the existing server-side admin allowlist used by /api/admin/stats.
const ADMIN_EMAILS = new Set(["isadin531@gmail.com"]);

export async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [user] = await db.select({ email: schema.users.email }).from(schema.users)
    .where(eq(schema.users.id, session.user.id)).limit(1);
  if (!user?.email || !ADMIN_EMAILS.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
