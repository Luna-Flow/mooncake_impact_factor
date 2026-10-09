import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { THEME_BOOTSTRAP } from "../../frontend/src/components/Chrome";
import { isLang, localeOf, locales, t } from "../../frontend/src/i18n";
import "../globals.css";

// One root layout per language, as the documentation site renders one
// <html lang> per locale: /en/, /zh-cn/ and /ja/.

type Params = Promise<{ lang: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ lang: locale.path }));
}

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { lang } = await props.params;
  return {
    title: t(lang, "site.title"),
    description: t(lang, "site.description"),
    icons: { icon: `${process.env["NEXT_PUBLIC_BASE_PATH"] ?? ""}/logo.svg` },
    alternates: {
      languages: Object.fromEntries(locales.map((locale) => [locale.lang, `/${locale.path}/`]))
    }
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#151418" }
  ]
};

// CJK pages: sans for body text, serif only for headings (one weight), as on
// the documentation site.
function fontsFor(lang: string): string {
  const tag = localeOf(lang).lang;
  const cjk = tag.startsWith("zh")
    ? "Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@600"
    : tag.startsWith("ja")
      ? "Noto+Sans+JP:wght@400;500;600&family=Noto+Serif+JP:wght@600"
      : null;
  return (
    "https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500" +
    (cjk ? `&family=${cjk}` : "") +
    "&display=swap"
  );
}

export default async function LangLayout(props: { children: ReactNode; params: Params }) {
  const { lang } = await props.params;
  if (!isLang(lang)) notFound();
  const locale = localeOf(lang);
  return (
    <html lang={locale.lang} data-locale={locale.path} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fontsFor(lang)} />
      </head>
      <body>
        <a className="skip" href="#content">
          {t(lang, "nav.skip")}
        </a>
        {props.children}
      </body>
    </html>
  );
}
