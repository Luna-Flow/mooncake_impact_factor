// Small encodings shared by every page, each with one meaning:
// - the grade is a letter in its own column; position, not colour, ranks it;
// - momentum is a signed change with a word; the word carries the label and
//   the colour only repeats it (Rising in the tip green, Cooling in the
//   warning amber of the documentation alerts);
// - the score bar is a length relative to the best score, like the coverage
//   bars of the documentation library.

import type { CSSProperties } from "react";

import { formatSigned, t, type Lang } from "../i18n";

export function GradeMark(props: { lang: Lang; grade: string }) {
  const { lang, grade } = props;
  return (
    <span className="grade" title={t(lang, `grade.title.${grade}`)}>
      {grade}
    </span>
  );
}

export function MomentumChange(props: { lang: Lang; label: string; change: number }) {
  const { lang, label, change } = props;
  if (label === "New") {
    return <span className="momentum momentum--new">{t(lang, "momentum.New")}</span>;
  }
  const kind = label === "Rising" ? "rising" : label === "Cooling" ? "cooling" : "stable";
  return (
    <span className={`momentum momentum--${kind}`} title={t(lang, `momentum.title.${label}`)}>
      <span className="momentum-change">{formatSigned(lang, change)}</span>
      {kind !== "stable" ? <span className="momentum-word">{t(lang, `momentum.${label}`)}</span> : null}
    </span>
  );
}

export function ScoreBar(props: { value: number }) {
  const value = Math.min(1, Math.max(0, props.value));
  return <span className="score-bar" aria-hidden="true" style={{ "--value": value.toFixed(3) } as CSSProperties} />;
}
