import { isNull } from "drizzle-orm";
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import * as schema from "@/db/schema";
import authConfig from "./auth.config";

async function claimOrphanData(userId: string) {
  const unclaimed = await db.select({ id: schema.portfolios.id }).from(schema.portfolios).where(isNull(schema.portfolios.userId)).limit(1);
  if (unclaimed.length === 0) return;
  await db.update(schema.portfolios).set({ userId }).where(isNull(schema.portfolios.userId));
  await db.update(schema.boxOpens).set({ userId }).where(isNull(schema.boxOpens.userId));
  await db.update(schema.alerts).set({ userId }).where(isNull(schema.alerts.userId));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "jwt" },
  events: {
    async signIn({ user }) {
      if (user.id) await claimOrphanData(user.id);
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}
