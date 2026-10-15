// Preserve URLs emitted by earlier deployments without running image
// generation on the server. The canonical image is a static public asset.
export function GET(request: Request) {
  return Response.redirect(new URL("/og-image.png", request.url), 308);
}
