"use client";

// How scores work, in the length a reader needs to interpret the labels.
// The derivations live in the score design page of the documentation.

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchIndexMeta } from "../client";
import { formatDate, formatInteger, t, type Lang } from "../i18n";
import type { IndexMeta } from "../types";
import { docsUrl, SiteFooter, SiteHeader } from "./Chrome";

const SECTIONS = ["signals", "owners", "recency", "grades", "momentum", "data", "limits"] as const;

export function MethodPage(props: { lang: Lang }) {
  const { lang } = props;
  const [meta, setMeta] = useState<IndexMeta | null>(null);
  useEffect(() => {
    fetchIndexMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <>
      <SiteHeader lang={lang} page="method" />
      <main id="content" className="doc-main package-main" tabIndex={-1}>
        <article className="doc method">
          <nav className="toc" aria-label={t(lang, "package.onThisPage")}>
            <details open>
              <summary>{t(lang, "package.onThisPage")}</summary>
              <ol>
                {SECTIONS.map((id) => (
                  <li key={id}>
                    <a href={`#${id}`}>{t(lang, `method.${id}.title`)}</a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>

          <h1>{t(lang, "method.heading")}</h1>
          <p className="lead">{t(lang, "method.lead")}</p>

          <section aria-labelledby="signals">
            <h2 id="signals">{t(lang, "method.signals.title")}</h2>
            <p>{t(lang, "method.signals.body")}</p>
            <p className="formula" aria-label={t(lang, "method.formulaLabel")}>
              <var>S</var> = <var>m</var>(<var>t</var>) · ( 38 ln(1 + <var>D</var>) + 27 ln(1 + <var>R</var>) + 22 ln(1 + <var>W</var>) )
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t(lang, "method.symbol")}</th>
                  <th scope="col">{t(lang, "score.signal")}</th>
                  <th scope="col" className="num">
                    {t(lang, "method.weight")}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <var>D</var>
                  </td>
                  <td>{t(lang, "method.signals.dependents")}</td>
                  <td className="num">38</td>
                </tr>
                <tr>
                  <td>
                    <var>R</var>
                  </td>
                  <td>{t(lang, "method.signals.recent")}</td>
                  <td className="num">27</td>
                </tr>
                <tr>
                  <td>
                    <var>W</var>
                  </td>
                  <td>{t(lang, "method.signals.downloads")}</td>
                  <td className="num">22</td>
                </tr>
              </tbody>
            </table>
            <p>{t(lang, "method.signals.log")}</p>
          </section>

          <section aria-labelledby="owners">
            <h2 id="owners">{t(lang, "method.owners.title")}</h2>
            <p>{t(lang, "method.owners.body")}</p>
          </section>

          <section aria-labelledby="recency">
            <h2 id="recency">{t(lang, "method.recency.title")}</h2>
            <p>{t(lang, "method.recency.body")}</p>
          </section>

          <section aria-labelledby="grades">
            <h2 id="grades">{t(lang, "method.grades.title")}</h2>
            <p>{t(lang, "method.grades.body")}</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t(lang, "table.grade")}</th>
                  <th scope="col">{t(lang, "method.grades.share")}</th>
                  <th scope="col" className="num">
                    {t(lang, "method.grades.count")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["S", "grade.title.S"],
                    ["A", "grade.title.A"],
                    ["B", "grade.title.B"],
                    ["C", "grade.title.C"],
                    ["D", "grade.title.D"]
                  ] as const
                ).map(([grade, key]) => (
                  <tr key={grade}>
                    <td>
                      <span className="grade">{grade}</span>
                    </td>
                    <td>{t(lang, key)}</td>
                    <td className="num">{meta ? formatInteger(lang, meta.rank_counts[grade] ?? 0) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="momentum">
            <h2 id="momentum">{t(lang, "method.momentum.title")}</h2>
            <p>{t(lang, "method.momentum.body")}</p>
            <dl className="definitions">
              {(["Rising", "Cooling", "Stable", "New"] as const).map((label) => (
                <div key={label}>
                  <dt>{t(lang, `momentum.${label}`)}</dt>
                  <dd>{t(lang, `momentum.title.${label}`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="data">
            <h2 id="data">{t(lang, "method.data.title")}</h2>
            <p>
              {t(lang, "method.data.body")}
              {meta ? ` ${t(lang, "method.data.current", { date: formatDate(lang, meta.computed_at), count: formatInteger(lang, meta.population) })}` : ""}
            </p>
          </section>

          <section aria-labelledby="limits">
            <h2 id="limits">{t(lang, "method.limits.title")}</h2>
            <p>{t(lang, "method.limits.body")}</p>
            <p>
              <a href={docsUrl(lang, "design/score/")}>{t(lang, "method.design")}</a> · <Link href={`/${lang}/`}>{t(lang, "method.back")}</Link>
            </p>
          </section>
        </article>
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}
