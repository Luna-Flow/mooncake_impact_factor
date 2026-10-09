// Interface strings and locale helpers. The tables are compiled from the
// gettext catalogs in web/i18n by `node scripts/i18n.mjs compile`, as the
// documentation site compiles its own; `t` has the same contract as the
// site's `t(lang, key, vars)`: the locale's text, else the English source,
// else the key, with `{name}` placeholders filled in.

import compiled from "./generated/strings.json";

export type Locale = { id: string; path: string; lang: string; label: string };

export const locales: Locale[] = compiled.locales;
export const sourceLocale: Locale = locales[0]!;

const strings: Record<string, Record<string, string>> = compiled.strings;

export type Lang = string;

export function isLang(value: string | undefined): value is Lang {
  return locales.some((locale) => locale.path === value);
}

export function localeOf(lang: Lang): Locale {
  return locales.find((locale) => locale.path === lang) ?? sourceLocale;
}

export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const text = strings[lang]?.[key] ?? strings[sourceLocale.path]?.[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** The same page in another language: only the first path segment differs. */
export function switchUrl(pathname: string, search: string, target: Locale): string {
  const rest = pathname.replace(/^\/[^/]+(?=\/|$)/, "");
  return `/${target.path}${rest || "/"}${search}`;
}

/** Remembers the reader's language under the key the documentation site uses. */
export function rememberLang(lang: Lang): void {
  try {
    localStorage.setItem("lf-lang", lang);
  } catch {
    // Storage can be unavailable; the URL still carries the language.
  }
}

export function formatInteger(lang: Lang, value: number): string {
  return new Intl.NumberFormat(localeOf(lang).lang).format(value);
}

export function formatCompact(lang: Lang, value: number): string {
  return new Intl.NumberFormat(localeOf(lang).lang, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatScore(lang: Lang, value: number): string {
  return new Intl.NumberFormat(localeOf(lang).lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function formatSigned(lang: Lang, value: number): string {
  return new Intl.NumberFormat(localeOf(lang).lang, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero"
  }).format(value);
}

export function formatPercent(lang: Lang, value: number, digits = 0): string {
  return new Intl.NumberFormat(localeOf(lang).lang, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatDate(lang: Lang, value: string | null | undefined): string {
  if (!value) return t(lang, "common.unknown");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat(localeOf(lang).lang, { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

/** "3 days ago", "5 months ago": the age of a release in the reader's language. */
export function formatAge(lang: Lang, days: number): string {
  const format = new Intl.RelativeTimeFormat(localeOf(lang).lang, { numeric: "auto" });
  if (days < 31) return format.format(-days, "day");
  if (days < 365) return format.format(-Math.round(days / 30.4), "month");
  return format.format(-Math.round(days / 365.25), "year");
}
