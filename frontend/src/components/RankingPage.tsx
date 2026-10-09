"use client";

// The rankings: every package of the registry in one table, filtered and
// sorted through URL parameters so that any view can be linked. The layout
// is the documentation site's: a sidebar of filters on the left (the
// navigation tree of the site), the table in the main column.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { parseNativeExpression } from "../../../lib/query";
import { fetchIndexMeta, PAGE_SIZE, searchRegistry } from "../client";
import {
  formatAge,
  formatCompact,
  formatDate,
  formatInteger,
  formatScore,
  formatSigned,
  t,
  type Lang
} from "../i18n";
import type { IndexMeta, PackageSummary, SearchResult } from "../types";
import { docsUrl, SiteFooter, SiteHeader } from "./Chrome";
import { GradeMark, MomentumChange, ScoreBar } from "./marks";
import { packageHref } from "./SearchDialog";

const GRADES = ["S", "A", "B", "C", "D"] as const;
const MOMENTA = ["Rising", "New", "Cooling", "Stable"] as const;
const AGES = ["", "30", "90", "365"] as const;

type SortKey = "position" | "name" | "external" | "owners" | "growth" | "age" | "downloads";
const DEFAULT_ORDER: Record<SortKey, "asc" | "desc"> = {
  position: "asc",
  name: "asc",
  external: "desc",
  owners: "desc",
  growth: "desc",
  age: "asc",
  downloads: "desc"
};

function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete("page");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };
  return { params, update };
}

function listParam(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function toggleInList(list: string[], value: string): string {
  return (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]).join(",");
}

/** A field that edits a URL parameter and writes it back after a pause in typing. */
function useDebouncedParam(value: string, write: (value: string) => void, delay = 300) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => write(draft), delay);
    return () => window.clearTimeout(timer);
    // `write` changes on every render; the draft is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, value, delay]);
  return [draft, setDraft] as const;
}

function Filters(props: { lang: Lang; meta: IndexMeta | null }) {
  const { lang, meta } = props;
  const { params, update } = useQueryState();
  const grades = listParam(params.get("rank"));
  const momentum = params.get("momentum") ?? "";
  const age = params.get("max_age") ?? "";
  const [external, setExternal] = useDebouncedParam(params.get("min_external_dependents") ?? "", (value) =>
    update({ min_external_dependents: value.trim() })
  );
  const [owners, setOwners] = useDebouncedParam(params.get("min_owners") ?? "", (value) => update({ min_owners: value.trim() }));
  const [expression, setExpression] = useDebouncedParam(params.get("expr") ?? "", () => undefined, 0);
  const expressionError = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      parseNativeExpression(expression);
      return null;
    } catch (error: unknown) {
      return error instanceof Error ? error.message : t(lang, "filters.expressionInvalid");
    }
  }, [expression, lang]);
  const share: Record<string, string> = { S: "5%", A: "15%", B: "35%", C: "65%", D: "100%" };

  const momentumLinks: Array<{ value: string; label: string; count: number | undefined }> = [
    { value: "", label: t(lang, "filters.all"), count: meta?.population },
    ...MOMENTA.map((value) => ({ value, label: t(lang, `momentum.${value}`), count: meta?.momentum_counts[value] }))
  ];

  return (
    <aside id="sidebar" className="sidebar" aria-label={t(lang, "filters.title")}>
      <div className="sidebar-inner">
        <div className="sidebar-repo">
          <span className="sidebar-repo-title">{t(lang, "rankings.title")}</span>
          <p>
            {meta
              ? t(lang, "rankings.summary", { count: formatInteger(lang, meta.population), date: formatDate(lang, meta.computed_at) })
              : " "}
          </p>
        </div>

        <section className="filter-group" aria-labelledby="filter-momentum">
          <h2 id="filter-momentum">{t(lang, "filters.momentum")}</h2>
          <ul className="nav-tree">
            {momentumLinks.map((item) => (
              <li key={item.value || "all"}>
                <a
                  href="#"
                  aria-current={momentum === item.value ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    update({
                      momentum: item.value,
                      sort: item.value === "Rising" || item.value === "Cooling" ? "growth" : null,
                      order: item.value === "Cooling" ? "asc" : null
                    });
                  }}
                >
                  <span>{item.label}</span>
                  {item.count !== undefined ? <span className="count">{formatInteger(lang, item.count)}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <fieldset className="filter-group">
          <legend>{t(lang, "filters.grade")}</legend>
          {GRADES.map((grade) => (
            <label key={grade} className="check">
              <input type="checkbox" checked={grades.includes(grade)} onChange={() => update({ rank: toggleInList(grades, grade) })} />
              <span className="grade-letter">{grade}</span>
              <span className="check-note">{t(lang, grade === "D" ? "grade.rest" : "grade.top", { share: share[grade]! })}</span>
              {meta ? <span className="count">{formatInteger(lang, meta.rank_counts[grade] ?? 0)}</span> : null}
            </label>
          ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>{t(lang, "filters.adoption")}</legend>
          <label className="field">
            <span>{t(lang, "filters.minExternal")}</span>
            <input type="number" min={0} inputMode="numeric" value={external} onChange={(event) => setExternal(event.target.value)} />
          </label>
          <label className="field">
            <span>{t(lang, "filters.minOwners")}</span>
            <input type="number" min={0} inputMode="numeric" value={owners} onChange={(event) => setOwners(event.target.value)} />
          </label>
        </fieldset>

        <fieldset className="filter-group">
          <legend>{t(lang, "filters.released")}</legend>
          {AGES.map((value) => (
            <label key={value || "any"} className="check">
              <input type="radio" name="max_age" checked={age === value} onChange={() => update({ max_age: value })} />
              <span>{value ? t(lang, `filters.within${value}`) : t(lang, "filters.anyTime")}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>{t(lang, "filters.metadata")}</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={params.get("has_repository") === "true"}
              onChange={(event) => update({ has_repository: event.target.checked ? "true" : null })}
            />
            <span>{t(lang, "filters.hasRepository")}</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={params.get("has_license") === "true"}
              onChange={(event) => update({ has_license: event.target.checked ? "true" : null })}
            />
            <span>{t(lang, "filters.hasLicense")}</span>
          </label>
        </fieldset>

        <form
          className="filter-group"
          onSubmit={(event) => {
            event.preventDefault();
            if (!expressionError) update({ expr: expression.trim() });
          }}
        >
          <label className="field" htmlFor="filter-expression">
            <span>{t(lang, "filters.expression")}</span>
          </label>
          <textarea
            id="filter-expression"
            className="expression"
            rows={3}
            spellCheck={false}
            placeholder="keyword:json AND owners>=3"
            value={expression}
            aria-invalid={expressionError ? true : undefined}
            aria-describedby="filter-expression-help"
            onChange={(event) => setExpression(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (!expressionError) update({ expr: expression.trim() });
              }
            }}
          />
          <p id="filter-expression-help" className={expressionError ? "field-note is-error" : "field-note"}>
            {expressionError ?? (
              <>
                {t(lang, "filters.expressionHelp")}{" "}
                <a href={docsUrl(lang, "tutorial/query/")}>{t(lang, "filters.syntax")}</a>
              </>
            )}
          </p>
          <button type="submit" className="button" disabled={Boolean(expressionError) || expression.trim() === (params.get("expr") ?? "")}>
            {t(lang, "filters.apply")}
          </button>
        </form>
      </div>
    </aside>
  );
}

function SortHeader(props: { lang: Lang; label: string; sortKey: SortKey; numeric?: boolean; className?: string }) {
  const { lang, label, sortKey, numeric = false, className = "" } = props;
  const { params, update } = useQueryState();
  const sort = (params.get("sort") as SortKey | null) ?? "position";
  const order = params.get("order") ?? DEFAULT_ORDER[sort] ?? "asc";
  const active = sort === sortKey;
  return (
    <th scope="col" className={`${numeric ? "num " : ""}${className}`} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        className="sort-button"
        title={t(lang, "table.sortBy", { column: label })}
        onClick={() => {
          const nextOrder = active ? (order === "asc" ? "desc" : "asc") : DEFAULT_ORDER[sortKey];
          update({ sort: sortKey === "position" ? null : sortKey, order: nextOrder === DEFAULT_ORDER[sortKey] ? null : nextOrder });
        }}
      >
        {label}
        <span className="sort-mark" aria-hidden="true">
          {active ? (order === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
}

function RankingRow(props: { lang: Lang; item: PackageSummary; maxScore: number }) {
  const { lang, item, maxScore } = props;
  const slash = item.full_name.indexOf("/");
  return (
    <tr>
      <td className="num col-position">{formatInteger(lang, item.rank_position)}</td>
      <td className="col-package">
        <Link href={packageHref(lang, item.full_name)} className="package-link">
          <span className="package-owner">{item.full_name.slice(0, slash + 1)}</span>
          <wbr />
          <span className="package-name">{item.full_name.slice(slash + 1)}</span>
        </Link>
        {item.description ? <p className="package-description">{item.description}</p> : null}
      </td>
      <td className="col-grade">
        <GradeMark lang={lang} grade={item.rank_label} />
      </td>
      <td className="num col-optional" title={t(lang, "table.dependentsTitle", { external: item.external_dependent_count, own: item.self_dependent_count })}>
        {formatInteger(lang, item.external_dependent_count)}
      </td>
      <td className="num col-optional col-wide">{formatInteger(lang, item.dependent_owner_count)}</td>
      <td className="num col-momentum">
        <MomentumChange lang={lang} label={item.momentum_label} change={item.score_growth_30d} />
      </td>
      <td className="col-optional col-wide col-age" title={formatDate(lang, item.latest_created_at)}>
        {item.latest_created_at ? formatAge(lang, item.days_since_release) : t(lang, "common.unknown")}
      </td>
      <td className="num col-optional col-wide" title={formatInteger(lang, item.download_count)}>
        {formatCompact(lang, item.download_count)}
      </td>
      <td className="num col-score">
        <span className="score-value">{formatScore(lang, item.score)}</span>
        <ScoreBar value={maxScore > 0 ? item.score / maxScore : 0} />
      </td>
    </tr>
  );
}

function Pager(props: { lang: Lang; page: number; total: number }) {
  const { lang, page, total } = props;
  const { update } = useQueryState();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav className="pager rankings-pager" aria-label={t(lang, "pager.label")}>
      <button type="button" className="text-button" disabled={page <= 1} onClick={() => update({ page: page > 2 ? String(page - 1) : null }, true)}>
        ← {t(lang, "pager.previous")}
      </button>
      <span>{t(lang, "pager.status", { page: formatInteger(lang, page), pages: formatInteger(lang, pages) })}</span>
      <button type="button" className="text-button" disabled={page >= pages} onClick={() => update({ page: String(page + 1) }, true)}>
        {t(lang, "pager.next")} →
      </button>
    </nav>
  );
}

export function RankingPage(props: { lang: Lang }) {
  const { lang } = props;
  const { params, update } = useQueryState();
  const [meta, setMeta] = useState<IndexMeta | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const key = params.toString();
  const [text, setText] = useDebouncedParam(params.get("q") ?? "", (value) => update({ q: value.trim() }));

  useEffect(() => {
    fetchIndexMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchRegistry(new URLSearchParams(key), page)
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        // Never leave the results of an earlier query under an error.
        setResult(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, page, attempt]);

  const filtered = [...params.keys()].some((name) => name !== "page" && name !== "sort" && name !== "order");
  const maxScore = meta?.top_score ?? 0;
  const total = result?.total ?? 0;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);

  return (
    <>
      <SiteHeader lang={lang} page="rankings" hasSidebar />
      <div className="doc-layout">
        <Filters lang={lang} meta={meta} />
        <main id="content" className="rankings-main" tabIndex={-1}>
          <header className="page-header">
            <h1>{t(lang, "rankings.heading")}</h1>
            <p className="lead">
              {t(lang, "rankings.lead")} <Link href={`/${lang}/method/`}>{t(lang, "rankings.howItWorks")}</Link>
            </p>
          </header>

          <div className="results-bar">
            <label className="filter-field">
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="m10.5 10.5 3.25 3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="visually-hidden">{t(lang, "rankings.filterLabel")}</span>
              <input type="search" value={text} placeholder={t(lang, "rankings.filterPlaceholder")} onChange={(event) => setText(event.target.value)} />
            </label>
            <p className="results-count" aria-live="polite">
              {error
                ? ""
                : result
                ? total === 0
                  ? t(lang, "rankings.none")
                  : t(lang, filtered ? "rankings.rangeFiltered" : "rankings.range", {
                      first: formatInteger(lang, first),
                      last: formatInteger(lang, last),
                      total: formatInteger(lang, total)
                    })
                : t(lang, "rankings.loading")}
            </p>
            {filtered ? (
              <button type="button" className="text-button" onClick={() => update(Object.fromEntries([...params.keys()].map((name) => [name, null])))}>
                {t(lang, "filters.clear")}
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="notice notice--caution" role="alert">
              <strong>{t(lang, "rankings.errorTitle")}</strong>
              <p>{error}</p>
              <button type="button" className="button" onClick={() => setAttempt((count) => count + 1)}>
                {t(lang, "common.retry")}
              </button>
            </div>
          ) : null}

          {result && total > 0 ? (
            <div className={`table-scroll${loading ? " is-loading" : ""}`} aria-busy={loading}>
              <table className="rankings">
                <caption className="visually-hidden">{t(lang, "rankings.caption")}</caption>
                <thead>
                  <tr>
                    <SortHeader lang={lang} label="#" sortKey="position" numeric className="col-position" />
                    <SortHeader lang={lang} label={t(lang, "table.package")} sortKey="name" className="col-package" />
                    <th scope="col" className="col-grade">
                      <abbr title={t(lang, "table.gradeTitle")}>{t(lang, "table.grade")}</abbr>
                    </th>
                    <SortHeader lang={lang} label={t(lang, "table.dependents")} sortKey="external" numeric className="col-optional" />
                    <SortHeader lang={lang} label={t(lang, "table.owners")} sortKey="owners" numeric className="col-optional col-wide" />
                    <SortHeader lang={lang} label={t(lang, "table.change")} sortKey="growth" numeric className="col-momentum" />
                    <SortHeader lang={lang} label={t(lang, "table.released")} sortKey="age" className="col-optional col-wide" />
                    <SortHeader lang={lang} label={t(lang, "table.downloads")} sortKey="downloads" numeric className="col-optional col-wide" />
                    <th scope="col" className="num col-score">
                      {t(lang, "table.score")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <RankingRow key={item.full_name} lang={lang} item={item} maxScore={maxScore} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result && total === 0 && !error ? (
            <div className="empty-state">
              <p>{t(lang, "rankings.emptyBody")}</p>
              {filtered ? (
                <button type="button" className="button" onClick={() => update(Object.fromEntries([...params.keys()].map((name) => [name, null])))}>
                  {t(lang, "filters.clear")}
                </button>
              ) : null}
            </div>
          ) : null}

          <Pager lang={lang} page={page} total={total} />
          <SiteFooter lang={lang} />
        </main>
      </div>
    </>
  );
}
