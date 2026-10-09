"use client";

// One package, laid out like a documentation page: breadcrumbs, title and
// lead, then sections with a table of contents in the margin column. The
// page answers "should I depend on this?": where the package stands, where
// its score comes from, who relies on it, what it relies on, and how it is
// released.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchIndexMeta, fetchPackage } from "../client";
import {
  formatAge,
  formatDate,
  formatInteger,
  formatPercent,
  formatScore,
  formatSigned,
  t,
  type Lang
} from "../i18n";
import type { IndexMeta, PackageAnalysis } from "../types";
import { SiteFooter, SiteHeader } from "./Chrome";
import { GradeMark, MomentumChange, ScoreBar } from "./marks";
import { packageHref } from "./SearchDialog";

const SECTIONS = ["standing", "score", "momentum", "dependents", "dependencies", "releases"] as const;
const PREVIEW = { dependents: 25, releases: 10 };

function Section(props: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="package-section" aria-labelledby={props.id}>
      <h2 id={props.id}>{props.title}</h2>
      {props.children}
    </section>
  );
}

function Breakdown(props: { lang: Lang; analysis: PackageAnalysis; topScore: number }) {
  const { lang, analysis, topScore } = props;
  const pkg = analysis.detail;
  const parts = pkg.breakdown;
  const subtotal = parts.dependents + parts.recent_dependents + parts.downloads;
  const rows = [
    {
      label: t(lang, "score.dependents"),
      count:
        pkg.self_dependent_count > 0
          ? t(lang, "score.dependentsCount", {
              external: formatInteger(lang, pkg.external_dependent_count),
              own: formatInteger(lang, pkg.self_dependent_count)
            })
          : formatInteger(lang, pkg.external_dependent_count),
      points: parts.dependents
    },
    { label: t(lang, "score.recent"), count: formatInteger(lang, pkg.recent_dependent_count), points: parts.recent_dependents },
    { label: t(lang, "score.downloads"), count: formatInteger(lang, pkg.download_count), points: parts.downloads }
  ];
  return (
    <table className="breakdown">
      <thead>
        <tr>
          <th scope="col">{t(lang, "score.signal")}</th>
          <th scope="col" className="num">
            {t(lang, "score.count")}
          </th>
          <th scope="col" className="num">
            {t(lang, "score.points")}
          </th>
          <th scope="col" className="col-bar">
            <span className="visually-hidden">{t(lang, "score.share")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td className="num breakdown-count">{row.count}</td>
            <td className="num">{formatScore(lang, row.points)}</td>
            <td className="col-bar">
              <ScoreBar value={topScore > 0 ? row.points / topScore : 0} />
            </td>
          </tr>
        ))}
        <tr className="breakdown-subtotal">
          <th scope="row">{t(lang, "score.subtotal")}</th>
          <td />
          <td className="num">{formatScore(lang, subtotal)}</td>
          <td />
        </tr>
        <tr>
          <th scope="row">{t(lang, "score.recency")}</th>
          <td className="num">{pkg.latest_created_at ? formatAge(lang, pkg.days_since_release) : t(lang, "common.unknown")}</td>
          <td className="num">× {parts.multiplier.toFixed(3)}</td>
          <td />
        </tr>
        <tr className="breakdown-total">
          <th scope="row">{t(lang, "score.total")}</th>
          <td />
          <td className="num">{formatScore(lang, pkg.score)}</td>
          <td className="col-bar">
            <ScoreBar value={topScore > 0 ? pkg.score / topScore : 0} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PackageBody(props: { lang: Lang; analysis: PackageAnalysis; meta: IndexMeta | null }) {
  const { lang, analysis, meta } = props;
  const pkg = analysis.detail;
  const [allDependents, setAllDependents] = useState(false);
  const [allReleases, setAllReleases] = useState(false);
  const population = meta?.population ?? 0;
  // Share of the registry at or above this position, rounded up so that the
  // first package reads "top 0.1%" rather than "top 0.0%".
  const top = population > 0 ? Math.ceil((pkg.rank_position / population) * 1000) / 1000 : 0;
  const external = analysis.dependents.filter((item) => !item.same_owner);
  const dependents = allDependents ? analysis.dependents : analysis.dependents.slice(0, PREVIEW.dependents);
  const releases = allReleases ? pkg.versions : pkg.versions.slice(0, PREVIEW.releases);
  const slash = pkg.full_name.indexOf("/");

  return (
    <article className="doc package">
      <nav className="toc" aria-label={t(lang, "package.onThisPage")}>
        <details open>
          <summary>{t(lang, "package.onThisPage")}</summary>
          <ol>
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`}>{t(lang, `package.${id}`)}</a>
              </li>
            ))}
          </ol>
        </details>
      </nav>

      <nav className="breadcrumbs" aria-label={t(lang, "package.breadcrumbs")}>
        <ol>
          <li>
            <Link href={`/${lang}/`}>{t(lang, "nav.rankings")}</Link>
          </li>
          <li>
            <Link href={`/${lang}/?q=${encodeURIComponent(pkg.owner)}`}>{pkg.owner}</Link>
          </li>
          <li aria-current="page" className="code">
            {pkg.full_name.slice(slash + 1)}
          </li>
        </ol>
      </nav>

      <h1>{pkg.full_name}</h1>
      <p className="lead">{pkg.description ?? t(lang, "common.noDescription")}</p>

      <dl className="package-meta">
        <div>
          <dt>{t(lang, "package.version")}</dt>
          <dd className="code">{pkg.latest_version ?? t(lang, "common.unknown")}</dd>
        </div>
        <div>
          <dt>{t(lang, "package.released")}</dt>
          <dd>{formatDate(lang, pkg.latest_created_at)}</dd>
        </div>
        <div>
          <dt>{t(lang, "package.license")}</dt>
          <dd>{pkg.license ?? t(lang, "package.noLicense")}</dd>
        </div>
        <div>
          <dt>{t(lang, "package.links")}</dt>
          <dd className="package-links">
            {pkg.repository ? <a href={pkg.repository}>{t(lang, "package.repository")}</a> : null}
            <a href={`https://mooncakes.io/docs/${pkg.full_name}`}>mooncakes.io</a>
          </dd>
        </div>
        {pkg.keywords.length > 0 ? (
          <div className="package-keywords">
            <dt>{t(lang, "package.keywords")}</dt>
            <dd>
              {pkg.keywords.map((keyword) => (
                <Link key={keyword} href={`/${lang}/?expr=${encodeURIComponent(`keyword:"${keyword}"`)}`}>
                  {keyword}
                </Link>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      <Section id="standing" title={t(lang, "package.standing")}>
        <dl className="standing">
          <div>
            <dt>{t(lang, "standing.position")}</dt>
            <dd>
              <strong>#{formatInteger(lang, pkg.rank_position)}</strong>
              {population ? <span>{t(lang, "standing.of", { count: formatInteger(lang, population) })}</span> : null}
            </dd>
          </div>
          <div>
            <dt>{t(lang, "standing.grade")}</dt>
            <dd>
              <GradeMark lang={lang} grade={pkg.rank_label} />
              {population ? <span>{t(lang, "standing.top", { share: formatPercent(lang, top, top < 0.01 ? 1 : 0) })}</span> : null}
            </dd>
          </div>
          <div>
            <dt>{t(lang, "standing.score")}</dt>
            <dd>
              <strong>{formatScore(lang, pkg.score)}</strong>
            </dd>
          </div>
          <div>
            <dt>{t(lang, "standing.change")}</dt>
            <dd>
              <MomentumChange lang={lang} label={pkg.momentum_label} change={pkg.score_growth_30d} />
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="score" title={t(lang, "package.score")}>
        <p className="section-intro">
          {t(lang, "score.intro")} <Link href={`/${lang}/method/`}>{t(lang, "rankings.howItWorks")}</Link>
        </p>
        <div className="table-scroll">
          <Breakdown lang={lang} analysis={analysis} topScore={meta?.top_score ?? pkg.score} />
        </div>
      </Section>

      <Section id="momentum" title={t(lang, "package.momentum")}>
        <p>
          {pkg.momentum_label === "New"
            ? t(lang, "momentum.explainNew")
            : t(lang, "momentum.explain", {
                before: formatScore(lang, pkg.score_30d_ago),
                now: formatScore(lang, pkg.score),
                change: formatSigned(lang, pkg.score_growth_30d),
                label: t(lang, `momentum.${pkg.momentum_label}`)
              })}{" "}
          {pkg.momentum_label === "New" ? null : t(lang, "momentum.rule")}
        </p>
        {pkg.download_count_30d_ago !== null ? (
          <p className="section-note">
            {t(lang, "momentum.downloads", {
              before: formatInteger(lang, pkg.download_count_30d_ago),
              now: formatInteger(lang, pkg.download_count)
            })}
          </p>
        ) : meta && !meta.download_history_used ? (
          <p className="section-note">{t(lang, "momentum.noDownloadHistory")}</p>
        ) : null}
      </Section>

      <Section id="dependents" title={t(lang, "package.dependents")}>
        <p>
          {analysis.dependents.length === 0
            ? t(lang, "dependents.none")
            : t(lang, "dependents.summary", {
                external: formatInteger(lang, external.length),
                owners: formatInteger(lang, pkg.dependent_owner_count),
                own: formatInteger(lang, pkg.self_dependent_count),
                owner: pkg.owner
              })}
        </p>
        {analysis.dependents.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t(lang, "table.package")}</th>
                  <th scope="col">{t(lang, "dependents.relation")}</th>
                  <th scope="col">{t(lang, "table.grade")}</th>
                  <th scope="col" className="num">
                    #
                  </th>
                  <th scope="col">{t(lang, "dependents.since")}</th>
                </tr>
              </thead>
              <tbody>
                {dependents.map((item) => (
                  <tr key={item.full_name}>
                    <td>
                      <Link href={packageHref(lang, item.full_name)}>{item.full_name}</Link>
                    </td>
                    <td className={item.same_owner ? "relation relation--own" : "relation"}>
                      {item.same_owner ? t(lang, "dependents.sameOwner") : t(lang, "dependents.otherOwner")}
                    </td>
                    <td>
                      <GradeMark lang={lang} grade={item.rank_label} />
                    </td>
                    <td className="num">{formatInteger(lang, item.rank_position)}</td>
                    <td>{formatDate(lang, item.first_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {analysis.dependents.length > PREVIEW.dependents ? (
          <button type="button" className="text-button" onClick={() => setAllDependents((value) => !value)}>
            {allDependents ? t(lang, "common.showFewer") : t(lang, "common.showAll", { count: formatInteger(lang, analysis.dependents.length) })}
          </button>
        ) : null}
      </Section>

      <Section id="dependencies" title={t(lang, "package.dependencies")}>
        {analysis.dependencies.length === 0 ? (
          <p>{t(lang, "dependencies.none")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t(lang, "table.package")}</th>
                  <th scope="col">{t(lang, "dependencies.requirement")}</th>
                  <th scope="col">{t(lang, "table.grade")}</th>
                  <th scope="col" className="num">
                    #
                  </th>
                </tr>
              </thead>
              <tbody>
                {analysis.dependencies.map((item) => (
                  <tr key={item.full_name}>
                    <td>{item.in_registry ? <Link href={packageHref(lang, item.full_name)}>{item.full_name}</Link> : item.full_name}</td>
                    <td className="code">{item.version_req ?? t(lang, "dependencies.local")}</td>
                    <td>{item.rank_label ? <GradeMark lang={lang} grade={item.rank_label} /> : <span className="muted">{t(lang, "dependencies.notInRegistry")}</span>}</td>
                    <td className="num">{item.rank_position !== null ? formatInteger(lang, item.rank_position) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="releases" title={t(lang, "package.releases")}>
        <p>{t(lang, "releases.summary", { count: formatInteger(lang, pkg.version_count) })}</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t(lang, "package.version")}</th>
                <th scope="col">{t(lang, "package.released")}</th>
                <th scope="col" className="num">
                  {t(lang, "releases.dependencies")}
                </th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release.version} className={release.yanked ? "is-yanked" : undefined}>
                  <td className="code">
                    {release.version}
                    {release.yanked ? <span className="tag">{t(lang, "releases.yanked")}</span> : null}
                  </td>
                  <td>{formatDate(lang, release.created_at)}</td>
                  <td className="num">
                    {release.deps && typeof release.deps === "object" ? formatInteger(lang, Object.keys(release.deps).length) : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pkg.versions.length > PREVIEW.releases ? (
          <button type="button" className="text-button" onClick={() => setAllReleases((value) => !value)}>
            {allReleases ? t(lang, "common.showFewer") : t(lang, "common.showAll", { count: formatInteger(lang, pkg.versions.length) })}
          </button>
        ) : null}
      </Section>
    </article>
  );
}

export function PackagePage(props: { lang: Lang }) {
  const { lang } = props;
  const name = useSearchParams().get("name") ?? "";
  const [analysis, setAnalysis] = useState<PackageAnalysis | null>(null);
  const [meta, setMeta] = useState<IndexMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIndexMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setAnalysis(null);
    setError(null);
    fetchPackage(name)
      .then((value) => {
        if (!cancelled) setAnalysis(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  useEffect(() => {
    document.title = analysis ? `${analysis.detail.full_name} · ${t(lang, "site.product")}` : t(lang, "site.title");
  }, [analysis, lang]);

  return (
    <>
      <SiteHeader lang={lang} page="package" />
      <main id="content" className="doc-main package-main" tabIndex={-1}>
        {!name || error ? (
          <div className="doc">
            <h1>{t(lang, "package.notFoundTitle")}</h1>
            <p className="lead">{name ? t(lang, "package.notFound", { name }) : t(lang, "package.noName")}</p>
            <p>
              <Link href={`/${lang}/${name ? `?q=${encodeURIComponent(name)}` : ""}`}>{t(lang, "package.searchInstead")}</Link>
            </p>
          </div>
        ) : analysis ? (
          <PackageBody lang={lang} analysis={analysis} meta={meta} />
        ) : (
          <div className="doc">
            <p className="loading-line" role="status">
              {t(lang, "package.loading", { name })}
            </p>
          </div>
        )}
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}
