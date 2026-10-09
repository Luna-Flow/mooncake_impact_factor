import { z } from "zod";

import {
  packageAnalysisSchema,
  packageSearchPageSchema,
  packageSummaryListSchema,
  type PackageAnalysis,
  type PackageSearchPage,
  type PackageSummary
} from "./types";

export type SearchSort =
  | "relevance"
  | "score"
  | "growth"
  | "downloads"
  | "dependents"
  | "recent"
  | "updated"
  | "name"
  | "external"
  | "owners"
  | "position"
  | "age";

export type SearchOrder = "asc" | "desc";
// Rank and momentum take one label or a comma-separated list ("S,A"); the
// label sets are RANK_LABELS and MOMENTUM_LABELS in lib/query.ts.
export type SearchRank = "" | "S" | "A" | "B" | "C" | "D" | (string & {});
export type SearchMomentum = "" | "New" | "Rising" | "Stable" | "Cooling" | (string & {});
export type FeedSource = "top" | "hot" | "rising";

export type AdvancedSearchParams = {
  q: string;
  owner: string;
  packageName: string;
  keyword: string;
  description: string;
  license: string;
  repository: string;
  rank: SearchRank;
  momentum: SearchMomentum;
  minScore: string;
  maxScore: string;
  minDependents: string;
  minRecentDependents: string;
  minExternalDependents: string;
  minOwners: string;
  maxAge: string;
  minDownloads: string;
  fromYear: string;
  toYear: string;
  hasRepository: "" | "true" | "false";
  hasLicense: "" | "true" | "false";
  sort: SearchSort | "";
  order: SearchOrder | "";
  /** Page size; blank means 50, at most 200. */
  limit: string;
  /** Matches to skip; blank means 0. */
  offset: string;
  expr: string;
  ast: string;
};

export const DEFAULT_SEARCH_PARAMS: AdvancedSearchParams = {
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
  minExternalDependents: "",
  minOwners: "",
  maxAge: "",
  minDownloads: "",
  fromYear: "",
  toYear: "",
  hasRepository: "",
  hasLicense: "",
  sort: "",
  order: "",
  limit: "",
  offset: "",
  expr: "",
  ast: ""
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

function appendIfPresent(query: URLSearchParams, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) {
    query.set(key, trimmed);
  }
}

function appendNumericIfPresent(query: URLSearchParams, key: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  query.set(key, trimmed);
}

function appendBooleanIfPresent(query: URLSearchParams, key: string, value: "" | "true" | "false"): void {
  if (value) {
    query.set(key, value);
  }
}

function buildSearchQuery(params: Partial<AdvancedSearchParams>): URLSearchParams {
  const query = new URLSearchParams();
  appendIfPresent(query, "q", params.q ?? "");
  appendIfPresent(query, "owner", params.owner ?? "");
  appendIfPresent(query, "package", params.packageName ?? "");
  appendIfPresent(query, "keyword", params.keyword ?? "");
  appendIfPresent(query, "description", params.description ?? "");
  appendIfPresent(query, "license", params.license ?? "");
  appendIfPresent(query, "repository", params.repository ?? "");
  appendIfPresent(query, "rank", params.rank ?? "");
  appendIfPresent(query, "momentum", params.momentum ?? "");
  appendNumericIfPresent(query, "min_score", params.minScore ?? "");
  appendNumericIfPresent(query, "max_score", params.maxScore ?? "");
  appendNumericIfPresent(query, "min_dependents", params.minDependents ?? "");
  appendNumericIfPresent(query, "min_recent_dependents", params.minRecentDependents ?? "");
  appendNumericIfPresent(query, "min_external_dependents", params.minExternalDependents ?? "");
  appendNumericIfPresent(query, "min_owners", params.minOwners ?? "");
  appendNumericIfPresent(query, "max_age", params.maxAge ?? "");
  appendNumericIfPresent(query, "min_downloads", params.minDownloads ?? "");
  appendNumericIfPresent(query, "from_year", params.fromYear ?? "");
  appendNumericIfPresent(query, "to_year", params.toYear ?? "");
  appendBooleanIfPresent(query, "has_repository", params.hasRepository ?? "");
  appendBooleanIfPresent(query, "has_license", params.hasLicense ?? "");
  appendIfPresent(query, "sort", params.sort ?? "");
  appendIfPresent(query, "order", params.order ?? "");
  appendNumericIfPresent(query, "limit", params.limit ?? "");
  appendNumericIfPresent(query, "offset", params.offset ?? "");
  appendIfPresent(query, "expr", params.expr ?? "");
  appendIfPresent(query, "ast", params.ast ?? "");
  return query;
}

export async function fetchFeed(source: FeedSource, limit = 50): Promise<PackageSummary[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  const data = await requestJson(
    `/api/feeds/${encodeURIComponent(source)}?${query.toString()}`,
    packageSummaryListSchema
  );
  return data.items;
}

/** One page of `/api/search` results with the total number of matches. */
export async function searchPackagesPage(params: Partial<AdvancedSearchParams> = {}): Promise<PackageSearchPage> {
  const query = buildSearchQuery(params);
  const suffix = query.toString();
  return requestJson(`/api/search${suffix ? `?${suffix}` : ""}`, packageSearchPageSchema);
}

export async function searchPackages(params: Partial<AdvancedSearchParams> = {}): Promise<PackageSummary[]> {
  return (await searchPackagesPage(params)).items;
}

export async function fetchPackageAnalysis(owner: string, packageName: string): Promise<PackageAnalysis> {
  return requestJson(
    `/api/packages/${encodeURIComponent(owner)}/${encodeURIComponent(packageName)}/analysis`,
    packageAnalysisSchema
  );
}
