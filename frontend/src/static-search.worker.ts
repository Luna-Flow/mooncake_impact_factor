import { deriveQueryAst, hasQueryAstIntent, type QueryAst } from "../../lib/query";
import { computeStaticRelevance, evaluateQueryNode, packageYear } from "../../lib/static-search";
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
