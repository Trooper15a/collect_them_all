"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

export function UserMenu() {
  const { data: session } = useSession();
  const [confirming, setConfirming] = useState(false);
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
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Sign out?</span>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("recentScans");
                localStorage.removeItem("bulkQueue");
                localStorage.removeItem("bulkMode");
                localStorage.removeItem("rnp-trade");
              } catch {}
              signOut();
            }}
            className="text-xs font-semibold text-down bg-down/15 border border-down/30 rounded-lg px-2 py-1 hover:bg-down/25 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-muted hover:text-fg transition-colors px-2 py-1 rounded-lg"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs text-muted hover:text-down transition-colors px-2 py-1 rounded-lg"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
