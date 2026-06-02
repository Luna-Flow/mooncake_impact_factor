import type { Metadata } from "next";
import type { ReactNode } from "react";

import { dictionaries } from "../frontend/src/i18n";
import "./globals.css";

const defaultLanguage = "zh-CN" as const;
const defaultCopy = dictionaries[defaultLanguage];

export const metadata: Metadata = {
  title: defaultCopy.appName,
  description: defaultCopy.toolbar.projectCaption
};

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <html lang={defaultLanguage}>
      <body>{children}</body>
    </html>
  );
}
