import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth, requireUserId } from "./auth";

function preferenceKey(userId: string, key: string) {
  return `user:${encodeURIComponent(userId)}:${encodeURIComponent(key)}`;
}

/** Anonymous catalog readers receive defaults, never another account's values. */
export async function getUserSetting(key: string, fallback: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) return fallback;
  const rows = await db.select().from(schema.settings)
    .where(eq(schema.settings.key, preferenceKey(session.user.id, key))).limit(1);
  return rows[0]?.value ?? fallback;
}

export async function setUserSetting(key: string, value: string) {
  const userId = await requireUserId();
  const scopedKey = preferenceKey(userId, key);
  await db.insert(schema.settings).values({ key: scopedKey, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}
