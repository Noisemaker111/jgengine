import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "JGengine next-host",
  description: "Next.js client + REST reads for a JGengine game host",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
