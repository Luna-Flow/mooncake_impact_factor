import type { StaticSearchIndexItem } from "../frontend/src/types";
import type { QueryAst, QueryNode, QueryTermNode } from "./query.js";

// Query evaluation of the static search worker
// (frontend/src/static-search.worker.ts), kept free of worker globals so
// that it can be tested under Node.js.

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function packageYear(pkg: StaticSearchIndexItem): number {
  const text = pkg.latest_created_at ?? "";
  if (text.length < 4) return 0;
  const value = Number(text.slice(0, 4));
  return Number.isFinite(value) ? value : 0;
}

function matchText(value: string, needle: string): boolean {
  const normalizedNeedle = normalizedText(needle);
  if (!normalizedNeedle) return true;
  return value.includes(normalizedNeedle);
}

function compareNumeric(left: number, operator: QueryTermNode["operator"], right: number): boolean {
  if (!Number.isFinite(right)) return false;
  if (operator === "eq") return left === right;
  if (operator === "gte") return left >= right;
  if (operator === "lte") return left <= right;
  return left === right;
}

export function matchTerm(pkg: StaticSearchIndexItem, term: QueryTermNode): boolean {
  switch (term.field) {
    case "text":
      return matchText(pkg.normalized_full_text, term.value);
    case "owner":
      return matchText(pkg.normalized_owner, term.value);
    case "package":
      return matchText(pkg.normalized_package, term.value);
    case "keyword":
      return pkg.normalized_keywords.some((keyword) => matchText(keyword, term.value));
    case "description":
      return matchText(pkg.normalized_description, term.value);
    case "license":
      return matchText(pkg.normalized_license, term.value);
    case "repository":
      return matchText(pkg.normalized_repository, term.value);
    case "rank":
      return pkg.rank_label === term.value;
    case "momentum":
      return pkg.momentum_label === term.value;
    case "score":
      return compareNumeric(pkg.score, term.operator, Number(term.value));
    case "dependents":
      return compareNumeric(pkg.dependent_count, term.operator, Number(term.value));
    case "recent_dependents":
      return compareNumeric(pkg.recent_dependent_count, term.operator, Number(term.value));
    case "downloads":
      return compareNumeric(pkg.download_count, term.operator, Number(term.value));
    case "year":
      return compareNumeric(packageYear(pkg), term.operator, Number(term.value));
    case "has_repository":
      return pkg.repository_present === (term.value === "true");
    case "has_license":
      return pkg.license_present === (term.value === "true");
    default:
      return false;
  }
}

export function evaluateQueryNode(pkg: StaticSearchIndexItem, node: QueryNode): boolean {
  if (node.kind === "term") {
    const matched = matchTerm(pkg, node);
    return node.negated ? !matched : matched;
  }
  const matched = node.op === "or"
    ? node.children.some((child) => evaluateQueryNode(pkg, child))
    : node.children.every((child) => evaluateQueryNode(pkg, child));
  return node.negated ? !matched : matched;
}

// Relevance counts the positive term leaves a package matches. A leaf whose
// effective polarity is negative (negated itself, or below an odd number of
// negated groups) never adds relevance: matching it is what the query
// excludes, so it must not rank a package higher (issue #4).
function countMatches(pkg: StaticSearchIndexItem, node: QueryNode, negatedAbove = false): number {
  const negated = negatedAbove !== Boolean(node.negated);
  if (node.kind === "term") {
    if (negated) return 0;
    return matchTerm(pkg, { ...node, negated: false }) ? 1 : 0;
  }
  return node.children.reduce((sum, child) => sum + countMatches(pkg, child, negated), 0);
}

export function computeStaticRelevance(pkg: StaticSearchIndexItem, ast: QueryAst): number {
  return countMatches(pkg, ast);
}
