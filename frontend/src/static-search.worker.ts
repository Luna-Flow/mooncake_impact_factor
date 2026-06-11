import { deriveQueryAst, hasQueryAstIntent, type QueryAst, type QueryNode, type QueryTermNode } from "../../lib/query";
import type { AdvancedSearchParams } from "./api";
import { staticSearchIndexSchema, type StaticSearchIndexItem } from "./types";

type WorkerRequest =
  | { type: "init"; id: number; indexUrl: string }
  | { type: "search"; id: number; params: AdvancedSearchParams };

type WorkerResponse =
  | { type: "ready"; id: number }
  | { type: "result"; id: number; items: StaticSearchIndexItem[] }
  | { type: "error"; id: number; message: string };

let indexedPackages: StaticSearchIndexItem[] | null = null;

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function packageYear(pkg: StaticSearchIndexItem): number {
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

function matchTerm(pkg: StaticSearchIndexItem, term: QueryTermNode): boolean {
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

function evaluateQueryNode(pkg: StaticSearchIndexItem, node: QueryNode): boolean {
  if (node.kind === "term") {
    const matched = matchTerm(pkg, node);
    return node.negated ? !matched : matched;
  }
  const matched = node.op === "or"
    ? node.children.some((child) => evaluateQueryNode(pkg, child))
    : node.children.every((child) => evaluateQueryNode(pkg, child));
  return node.negated ? !matched : matched;
}

function countMatches(pkg: StaticSearchIndexItem, node: QueryNode): number {
  if (node.kind === "term") {
    return matchTerm(pkg, { ...node, negated: false }) ? 1 : 0;
  }
  return node.children.reduce((sum, child) => sum + countMatches(pkg, child), 0);
}

function computeStaticRelevance(pkg: StaticSearchIndexItem, ast: QueryAst): number {
  return countMatches(pkg, ast);
}

function sortByRelevance(left: StaticSearchIndexItem, right: StaticSearchIndexItem, ast: QueryAst): number {
  const leftScore = computeStaticRelevance(left, ast);
  const rightScore = computeStaticRelevance(right, ast);
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.score !== right.score) return right.score - left.score;
  return left.full_name.localeCompare(right.full_name);
}

function sortPackages(items: StaticSearchIndexItem[], params: AdvancedSearchParams, ast: QueryAst): StaticSearchIndexItem[] {
  const sort = params.sort || (hasQueryAstIntent(ast) ? "relevance" : "score");
  const order = params.order || (sort === "name" || sort === "relevance" ? "asc" : "desc");
  const factor = order === "asc" ? 1 : -1;
  const sorted = [...items];
  sorted.sort((left, right) => {
    if (sort === "relevance") {
      return sortByRelevance(left, right, ast);
    }
    if (sort === "score") return factor * (left.score - right.score || left.full_name.localeCompare(right.full_name));
    if (sort === "growth") return factor * (left.score_growth_30d - right.score_growth_30d || left.full_name.localeCompare(right.full_name));
    if (sort === "downloads") return factor * (left.download_count - right.download_count || left.full_name.localeCompare(right.full_name));
    if (sort === "dependents") return factor * (left.dependent_count - right.dependent_count || left.full_name.localeCompare(right.full_name));
    if (sort === "recent") return factor * (left.recent_dependent_count - right.recent_dependent_count || left.full_name.localeCompare(right.full_name));
    if (sort === "updated") return factor * (packageYear(left) - packageYear(right) || left.full_name.localeCompare(right.full_name));
    if (sort === "name") return factor * left.full_name.localeCompare(right.full_name);
    return factor * (left.score - right.score || left.full_name.localeCompare(right.full_name));
  });
  return sorted;
}

async function handleInit(id: number, indexUrl: string): Promise<WorkerResponse> {
  if (indexedPackages) {
    return { type: "ready", id };
  }
  const response = await fetch(indexUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load static search index: HTTP ${response.status}`);
  }
  const payload = await response.json();
  indexedPackages = staticSearchIndexSchema.parse(payload).items;
  return { type: "ready", id };
}

function handleSearch(id: number, params: AdvancedSearchParams): WorkerResponse {
  if (!indexedPackages) {
    throw new Error("Static search worker is not initialized");
  }
  const ast = deriveQueryAst({
    q: params.q,
    owner: params.owner,
    packageName: params.packageName,
    keyword: params.keyword,
    description: params.description,
    license: params.license,
    repository: params.repository,
    rank: params.rank,
    momentum: params.momentum,
    minScore: params.minScore,
    maxScore: params.maxScore,
    minDependents: params.minDependents,
    minRecentDependents: params.minRecentDependents,
    minDownloads: params.minDownloads,
    fromYear: params.fromYear,
    toYear: params.toYear,
    hasRepository: params.hasRepository,
    hasLicense: params.hasLicense,
    sort: params.sort,
    order: params.order,
    expr: params.expr,
    ast: params.ast
  });
  const matched = hasQueryAstIntent(ast)
    ? indexedPackages.filter((pkg) => evaluateQueryNode(pkg, ast))
    : indexedPackages;
  return { type: "result", id, items: sortPackages(matched, params, ast) };
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const response =
      request.type === "init"
        ? await handleInit(request.id, request.indexUrl)
        : handleSearch(request.id, request.params);
    self.postMessage(response satisfies WorkerResponse);
  } catch (error: unknown) {
    self.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Unknown static search worker error"
    } satisfies WorkerResponse);
  }
});
