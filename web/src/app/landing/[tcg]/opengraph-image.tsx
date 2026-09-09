import { ImageResponse } from "next/og";
import { TCG_SEO, getTcgBySlug } from "../tcg-data";

export const runtime = "edge";
export const alt = "RipnPull — TCG Collection Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return TCG_SEO.map((t) => ({ tcg: t.slug }));
}

export default async function Image(props: { params: Promise<{ tcg: string }> }) {
  const { tcg: slug } = await props.params;
  const tcg = getTcgBySlug(slug);
  const name = tcg?.name ?? "Trading Card Games";
  const shortName = tcg?.shortName ?? "TCG";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#a78bfa",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            RipnPull
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: "#ffffff",
              textAlign: "center",
              lineHeight: 1.1,
              maxWidth: "900px",
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a1a1aa",
              textAlign: "center",
              maxWidth: "800px",
              lineHeight: 1.4,
            }}
          >
            Free {shortName} collection tracker with AI card scanner
          </div>
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            {["Prices", "Scanner", "Wishlist", "Offline"].map((tag) => (
              <div
                key={tag}
                style={{
                  background: "rgba(167, 139, 250, 0.15)",
                  border: "1px solid rgba(167, 139, 250, 0.3)",
                  borderRadius: "999px",
                  padding: "8px 20px",
                  fontSize: 18,
                  color: "#a78bfa",
                  fontWeight: 600,
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: 18,
            color: "#71717a",
          }}
        >
          ripnpull.ca — Free &amp; Open Source
        </div>
      </div>
    ),
    { ...size }
  );
}
