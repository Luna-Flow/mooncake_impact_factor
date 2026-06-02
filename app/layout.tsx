import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mooncake Impact Factor",
  description: "Research and analyze MoonBit package impact through a full-stack Next.js interface."
};

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
