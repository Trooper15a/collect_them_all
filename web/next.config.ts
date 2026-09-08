import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["node-cron", "onnxruntime-node", "sharp"],
  async headers() {
    return [
      {
        // onnxruntime-web multi-threaded WASM wants cross-origin isolation; harmless otherwise.
        // Plus baseline security headers for every route.
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // camera=(self) must stay allowed — the card scanner uses it.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      { source: "/model/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
      { source: "/icons/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
};

export default nextConfig;
