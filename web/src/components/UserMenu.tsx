"use client";

import { useSession, signOut } from "next-auth/react";

export function UserMenu() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-2">
      {session.user.image && (
        <img
          src={session.user.image}
          alt=""
          className="w-8 h-8 rounded-full border border-line"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{session.user.name}</div>
        <div className="text-[11px] text-muted truncate">{session.user.email}</div>
      </div>
      <button
        onClick={() => signOut()}
        className="text-xs text-muted hover:text-down transition-colors px-2 py-1 rounded-lg"
      >
        Sign out
      </button>
    </div>
  );
}
