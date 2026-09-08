"use client";

import { useEffect, useState } from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastData {
  id: number;
  message: string;
  type: "up" | "down" | "info";
  action?: ToastAction;
  durationMs: number;
}

let toastId = 0;
const listeners = new Set<(t: ToastData) => void>();

export function showToast(
  message: string,
  type: "up" | "down" | "info" = "info",
  opts?: { action?: ToastAction; durationMs?: number }
) {
  const t: ToastData = {
    id: ++toastId,
    message,
    type,
    action: opts?.action,
    durationMs: opts?.durationMs ?? (opts?.action ? 6000 : 3500),
  };
  listeners.forEach((fn) => fn(t));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const handler = (t: ToastData) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.durationMs);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 inset-x-4 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto glass rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg animate-[slideIn_0.3s_ease] flex items-center gap-3 ${
            t.type === "up" ? "text-up" : t.type === "down" ? "text-down" : "text-fg"
          }`}
        >
          <span>
            {t.type === "up" && "▲ "}
            {t.type === "down" && "▼ "}
            {t.message}
          </span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                t.action!.onClick();
              }}
              className="font-bold text-accent hover:underline"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
