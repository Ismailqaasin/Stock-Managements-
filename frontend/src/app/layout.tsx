import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Stockroom — Inventory workspace",
    template: "%s · Stockroom",
  },
  description: "A single-warehouse inventory and stock management workspace.",
  icons: { icon: "/mark.svg" },
};
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
