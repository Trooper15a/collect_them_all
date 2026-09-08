"use client";

import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("RipnPull crashed:", error);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0e1a",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "360px",
            width: "100%",
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "24px",
            padding: "32px 24px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ margin: "12px 0 24px", fontSize: "14px", color: "rgba(255, 255, 255, 0.6)" }}>
            RipnPull hit an unexpected error. Your collection data is safe.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              onClick={reset}
              style={{
                border: "none",
                cursor: "pointer",
                borderRadius: "12px",
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#ffffff",
                background: "linear-gradient(135deg, #3b82f6, #60a5fa)",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                display: "inline-block",
                borderRadius: "12px",
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.8)",
                textDecoration: "none",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            >
              Back to home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
