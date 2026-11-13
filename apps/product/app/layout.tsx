import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HIVELOT — Better buying, by the many",
  description: "Bring buyers together around a shared specification. Build procurement pools, meet suppliers, and coordinate a better order on QIE.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
