// Preserve URLs emitted by earlier deployments without running image
// generation on the server. The canonical image is a static public asset.
export function GET() {
  return new Response(null, {
    status: 308,
    headers: { Location: "/og-image.png" },
  });
}
