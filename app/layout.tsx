import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Juanca's Home · San Diego rentals",
  description: "A little coastal home search, picked just for Juanca.",
  applicationName: "Juanca's Home",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Juanca's Home" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f5f0",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
