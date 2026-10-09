"use client";

// Page chrome with the markup and class names of the documentation site's
// Header.astro and ThemeToggle.astro, so that web/base.css (copied from the
// site) styles both the same way.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { locales, localeOf, rememberLang, switchUrl, t, type Lang } from "../i18n";
import { SearchDialog } from "./SearchDialog";

export const REPOSITORY_URL = "https://github.com/Luna-Flow/mooncake_impact_factor";

export function docsUrl(lang: Lang, page = ""): string {
  return `https://lunaflow.cn/${lang}/mooncake_impact_factor/${page}`;
}

type Theme = "auto" | "light" | "dark";
const THEME_ORDER: Theme[] = ["auto", "light", "dark"];

function readTheme(): Theme {
  try {
    const value = localStorage.getItem("lf-theme");
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset["theme"];
  else document.documentElement.dataset["theme"] = theme;
}

/** Applied before the first paint, as on the documentation site. */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("lf-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function ThemeToggle(props: { lang: Lang }) {
  const { lang } = props;
  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => setTheme(readTheme()), []);
  const label = t(lang, `theme.${theme}`);
  return (
    <button
      className="theme-toggle icon-link"
      type="button"
      data-theme-state={theme}
      aria-label={`${t(lang, "theme.label")}: ${label}`}
      title={label}
      onClick={() => {
        const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]!;
        try {
          if (next === "auto") localStorage.removeItem("lf-theme");
          else localStorage.setItem("lf-theme", next);
        } catch {
          // The choice still applies to this page.
        }
        applyTheme(next);
        setTheme(next);
      }}
    >
      <svg className="theme-icon" data-for="auto" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
      </svg>
      <svg className="theme-icon" data-for="light" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <svg className="theme-icon" data-for="dark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M13.5 9.5A5.75 5.75 0 0 1 6.5 2.5a5.75 5.75 0 1 0 7 7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function LanguageMenu(props: { lang: Lang }) {
  const { lang } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLDetailsElement | null>(null);
  const current = localeOf(lang);
  const query = searchParams.toString();

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <details className="lang-menu" ref={ref}>
      <summary aria-label={t(lang, "lang.label")}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M1.75 8h12.5M8 1.75c2 2 2 10.5 0 12.5M8 1.75c-2 2-2 10.5 0 12.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
        <span>{current.label}</span>
      </summary>
      <ul>
        {locales.map((locale) => (
          <li key={locale.path}>
            <a
              href={switchUrl(pathname, query ? `?${query}` : "", locale)}
              hrefLang={locale.lang}
              lang={locale.lang}
              aria-current={locale.path === current.path ? "true" : undefined}
              onClick={() => rememberLang(locale.path)}
            >
              {locale.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SiteHeader(props: { lang: Lang; page: "rankings" | "package" | "method"; hasSidebar?: boolean }) {
  const { lang, page, hasSidebar = false } = props;
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("has-sidebar", hasSidebar);
    document.body.classList.toggle("nav-open", navOpen);
  }, [hasSidebar, navOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        {hasSidebar ? (
          <button className="menu-button" type="button" aria-controls="sidebar" aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="visually-hidden">{t(lang, navOpen ? "nav.close" : "nav.filters")}</span>
          </button>
        ) : null}
        <Link className="wordmark" href={`/${lang}/`}>
          <img src={`${process.env["NEXT_PUBLIC_BASE_PATH"] ?? ""}/logo.svg`} alt="" width={23} height={14} />
          <span>{t(lang, "site.name")}</span>
          <span className="wordmark-product">{t(lang, "site.product")}</span>
        </Link>
        <nav className="site-nav" aria-label={t(lang, "site.product")}>
          <Link href={`/${lang}/`} aria-current={page === "rankings" ? "page" : undefined}>
            {t(lang, "nav.rankings")}
          </Link>
          <Link href={`/${lang}/method/`} aria-current={page === "method" ? "page" : undefined}>
            {t(lang, "nav.method")}
          </Link>
          <a href={docsUrl(lang)}>{t(lang, "nav.docs")}</a>
        </nav>
        <div className="header-tools">
          <button className="search-button" type="button" onClick={() => setSearchOpen(true)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3.25 3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="search-label">{t(lang, "search.open")}</span>
            <kbd>/</kbd>
          </button>
          <LanguageMenu lang={lang} />
          <ThemeToggle lang={lang} />
          <a className="icon-link" href={REPOSITORY_URL} aria-label={t(lang, "nav.github")}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z"
              />
            </svg>
          </a>
        </div>
      </div>
      <SearchDialog lang={lang} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

export function SiteFooter(props: { lang: Lang }) {
  const { lang } = props;
  return (
    <footer className="site-footer">
      <p>{t(lang, "footer.note")}</p>
      <p className="footer-links">
        <a href={docsUrl(lang)}>{t(lang, "nav.docs")}</a>
        <a href={REPOSITORY_URL}>{t(lang, "nav.github")}</a>
        <a href="https://lunaflow.cn/">lunaflow.cn</a>
      </p>
    </footer>
  );
}
