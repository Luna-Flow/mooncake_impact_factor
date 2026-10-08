import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { dictionaries } from "../frontend/src/i18n";
import "./globals.css";

const defaultLanguage = "zh-CN" as const;
const defaultCopy = dictionaries[defaultLanguage];

// The type families of lunaflow.cn: Source Serif 4 for display text, IBM Plex
// Sans for the interface and IBM Plex Mono for code. Every family has a
// system fallback in web/tokens.css, so the page stays usable offline.
const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+SC:wght@600&display=swap";

// Apply an explicit theme choice before the first paint, as the documentation
// site does; "system" is left to the prefers-color-scheme rules.
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("mooncake-impact-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: defaultCopy.appName,
  description: defaultCopy.toolbar.projectCaption
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#151418" }
  ]
};

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <html lang={defaultLanguage} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_STYLESHEET} />
      </head>
      <body>{children}</body>
    </html>
  );
}
