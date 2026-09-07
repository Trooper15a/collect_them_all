import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/prices|api/tcgcsv|login|landing|_next/static|_next/image|icons|manifest\\.json|sw\\.js|favicon\\.ico|images|onnx|model|ort).*)",
  ],
};
