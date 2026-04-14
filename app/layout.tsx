import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tristar PT — Referral Intelligence",
  description: "Live referral intelligence dashboard for Tristar Physical Therapy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
