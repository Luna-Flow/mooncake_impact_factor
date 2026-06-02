import { z } from "zod";

import {
  staticManifestSchema,
  staticSearchPackageListSchema,
  packageAnalysisSchema,
  packageSummaryListSchema,
  type PackageAnalysis,
  type PackageSummary,
  type StaticManifest,
  type StaticSearchPackage
} from "./types";
import type { AdvancedSearchParams, FeedSource } from "./api";
import {
  deriveQueryAst,
  hasQueryAstIntent,
  type QueryAst,
  type QueryNode,
  type QueryTermNode
} from "../../lib/query";

type StaticSearchResponse = {
  items: PackageSummary[];
};

const STATIC_DATA_PREFIX = `${process.env["NEXT_PUBLIC_BASE_PATH"] ?? ""}/data`;

let manifestPromise: Promise<StaticManifest> | null = null;
let packagesPromise: Promise<StaticSearchPackage[]> | null = null;

type IndexedStaticPackage = StaticSearchPackage & {
  _normalized_full_text: string;
  _normalized_owner: string;
  _normalized_package: string;
  _normalized_description: string;
  _normalized_license: string;
  _normalized_repository: string;
  _normalized_keywords: string[];
};

async function requestJson<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return schema.parse(payload);
}

function staticAsset(pathname: string): string {
  return `${STATIC_DATA_PREFIX}/${pathname}`;
}

export async function fetchStaticManifest(): Promise<StaticManifest> {
  if (!manifestPromise) {
    manifestPromise = requestJson(staticAsset("manifest.json"), staticManifestSchema);
  }
  return manifestPromise;
}

async function fetchStaticSearchPackages(): Promise<StaticSearchPackage[]> {
  if (!packagesPromise) {
    packagesPromise = requestJson(staticAsset("search/packages.json"), staticSearchPackageListSchema).then((data) => data.items);
  }
  return packagesPromise;
}

export async function fetchStaticFeed(source: FeedSource): Promise<PackageSummary[]> {
  await fetchStaticManifest();
  const data = await requestJson(staticAsset(`feeds/${source}.json`), packageSummaryListSchema);
  return data.items;
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toIndexedPackage(pkg: StaticSearchPackage): IndexedStaticPackage {
  return {
    ...pkg,
    _normalized_full_text: normalizedText(
      `${pkg.full_name} ${pkg.owner} ${pkg.package_name} ${pkg.description ?? ""} ${pkg.keywords.join(" ")}`
    ),
    _normalized_owner: normalizedText(pkg.owner),
    _normalized_package: normalizedText(pkg.package_name),
    _normalized_description: normalizedText(pkg.description),
    _normalized_license: normalizedText(pkg.license),
    _normalized_repository: normalizedText(pkg.repository),
    _normalized_keywords: pkg.keywords.map((keyword) => normalizedText(keyword))
  };
}

function packageYear(pkg: StaticSearchPackage): number {
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

function matchTerm(pkg: IndexedStaticPackage, term: QueryTermNode): boolean {
  switch (term.field) {
    case "text":
      return matchText(pkg._normalized_full_text, term.value);
    case "owner":
      return matchText(pkg._normalized_owner, term.value);
    case "package":
      return matchText(pkg._normalized_package, term.value);
    case "keyword":
      return pkg._normalized_keywords.some((keyword) => matchText(keyword, term.value));
    case "description":
      return matchText(pkg._normalized_description, term.value);
    case "license":
      return matchText(pkg._normalized_license, term.value);
    case "repository":
      return matchText(pkg._normalized_repository, term.value);
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
      return Boolean(pkg.repository?.trim()) === (term.value === "true");
    case "has_license":
      return Boolean(pkg.license?.trim()) === (term.value === "true");
    default:
      return false;
  }
}

function compareNumeric(left: number, operator: QueryTermNode["operator"], right: number): boolean {
  if (!Number.isFinite(right)) return false;
  if (operator === "eq") return left === right;
  if (operator === "gte") return left >= right;
  if (operator === "lte") return left <= right;
  return left === right;
}

function evaluateQueryNode(pkg: IndexedStaticPackage, node: QueryNode): boolean {
  if (node.kind === "term") {
    const matched = matchTerm(pkg, node);
    return node.negated ? !matched : matched;
  }
  const matched = node.op === "or"
    ? node.children.some((child) => evaluateQueryNode(pkg, child))
    : node.children.every((child) => evaluateQueryNode(pkg, child));
  return node.negated ? !matched : matched;
}

function sortByRelevance(left: IndexedStaticPackage, right: IndexedStaticPackage, ast: QueryAst): number {
  const leftScore = computeStaticRelevance(left, ast);
  const rightScore = computeStaticRelevance(right, ast);
  if (leftScore !== rightScore) return rightScore - leftScore;
  if (left.score !== right.score) return right.score - left.score;
  return left.full_name.localeCompare(right.full_name);
}

function computeStaticRelevance(pkg: IndexedStaticPackage, ast: QueryAst): number {
  return countMatches(pkg, ast);
}

function countMatches(pkg: IndexedStaticPackage, node: QueryNode): number {
  if (node.kind === "term") {
    return matchTerm(pkg, { ...node, negated: false }) ? 1 : 0;
  }
  return node.children.reduce((sum, child) => sum + countMatches(pkg, child), 0);
}

function sortPackages(items: IndexedStaticPackage[], params: AdvancedSearchParams, ast: QueryAst): IndexedStaticPackage[] {
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

export async function searchStaticPackages(params: Partial<AdvancedSearchParams> = {}): Promise<PackageSummary[]> {
  await fetchStaticManifest();
  const packages = (await fetchStaticSearchPackages()).map(toIndexedPackage);
  const normalized: AdvancedSearchParams = {
    q: "",
    owner: "",
    packageName: "",
    keyword: "",
    description: "",
    license: "",
    repository: "",
    rank: "",
    momentum: "",
    minScore: "",
    maxScore: "",
    minDependents: "",
    minRecentDependents: "",
    minDownloads: "",
    fromYear: "",
    toYear: "",
    hasRepository: "",
    hasLicense: "",
    sort: "",
    order: "",
    expr: "",
    ast: "",
    ...params
  };
  const ast = deriveQueryAst({
    q: normalized.q,
    owner: normalized.owner,
    packageName: normalized.packageName,
    keyword: normalized.keyword,
    description: normalized.description,
    license: normalized.license,
    repository: normalized.repository,
    rank: normalized.rank,
    momentum: normalized.momentum,
    minScore: normalized.minScore,
    maxScore: normalized.maxScore,
    minDependents: normalized.minDependents,
    minRecentDependents: normalized.minRecentDependents,
    minDownloads: normalized.minDownloads,
    fromYear: normalized.fromYear,
    toYear: normalized.toYear,
    hasRepository: normalized.hasRepository,
    hasLicense: normalized.hasLicense,
    sort: normalized.sort,
    order: normalized.order,
    expr: normalized.expr,
    ast: normalized.ast
  });
  const matched = hasQueryAstIntent(ast)
    ? packages.filter((pkg) => evaluateQueryNode(pkg, ast))
    : packages;
  return sortPackages(matched, normalized, ast).map((pkg) => ({
    full_name: pkg.full_name,
    owner: pkg.owner,
    package_name: pkg.package_name,
    description: pkg.description,
    latest_version: pkg.latest_version,
    dependent_count: pkg.dependent_count,
    recent_dependent_count: pkg.recent_dependent_count,
    download_count: pkg.download_count,
    score: pkg.score,
    score_30d_ago: pkg.score_30d_ago,
    score_growth_30d: pkg.score_growth_30d,
    score_growth_ratio_30d: pkg.score_growth_ratio_30d,
    rank_label: pkg.rank_label,
    momentum_label: pkg.momentum_label
  }));
}

export async function fetchStaticPackageAnalysis(owner: string, packageName: string): Promise<PackageAnalysis> {
  await fetchStaticManifest();
  return requestJson(staticAsset(`packages/${owner}--${packageName}.json`), packageAnalysisSchema);
}

export async function searchStaticPackagesResponse(params: Partial<AdvancedSearchParams> = {}): Promise<StaticSearchResponse> {
  return { items: await searchStaticPackages(params) };
}
