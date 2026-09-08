import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to RipnPull with your Google account to track your TCG collection.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
