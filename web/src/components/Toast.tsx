"use client";

import { useEffect, useState } from "react";

interface ToastData {
  id: number;
  message: string;
  type: "up" | "down" | "info";
}

let toastId = 0;
const listeners = new Set<(t: ToastData) => void>();

export function showToast(message: string, type: "up" | "down" | "info" = "info") {
  const t = { id: ++toastId, message, type };
  listeners.forEach((fn) => fn(t));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const handler = (t: ToastData) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 inset-x-4 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto glass rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg animate-[slideIn_0.3s_ease] ${
            t.type === "up" ? "text-up" : t.type === "down" ? "text-down" : "text-fg"
          }`}
        >
          {t.type === "up" && "▲ "}
          {t.type === "down" && "▼ "}
          {t.message}
        </div>
      ))}
    </div>
  );
}
