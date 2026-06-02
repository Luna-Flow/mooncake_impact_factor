import { z } from "zod";

import {
  packageAnalysisSchema,
  packageSummaryListSchema,
  type PackageAnalysis,
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
  | "name";

export type SearchOrder = "asc" | "desc";
export type SearchRank = "" | "S" | "A" | "B" | "C" | "D";
export type SearchMomentum = "" | "Hot" | "Rising" | "Stable";
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
  minDownloads: string;
  fromYear: string;
  toYear: string;
  hasRepository: "" | "true" | "false";
  hasLicense: "" | "true" | "false";
  sort: SearchSort | "";
  order: SearchOrder | "";
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
  minDownloads: "",
  fromYear: "",
  toYear: "",
  hasRepository: "",
  hasLicense: "",
  sort: "",
  order: ""
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
  appendNumericIfPresent(query, "min_downloads", params.minDownloads ?? "");
  appendNumericIfPresent(query, "from_year", params.fromYear ?? "");
  appendNumericIfPresent(query, "to_year", params.toYear ?? "");
  appendBooleanIfPresent(query, "has_repository", params.hasRepository ?? "");
  appendBooleanIfPresent(query, "has_license", params.hasLicense ?? "");
  appendIfPresent(query, "sort", params.sort ?? "");
  appendIfPresent(query, "order", params.order ?? "");
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

export async function searchPackages(params: Partial<AdvancedSearchParams> = {}): Promise<PackageSummary[]> {
  const query = buildSearchQuery(params);
  const suffix = query.toString();
  const data = await requestJson(
    `/api/search${suffix ? `?${suffix}` : ""}`,
    packageSummaryListSchema
  );
  return data.items;
}

export async function fetchPackageAnalysis(owner: string, packageName: string): Promise<PackageAnalysis> {
  return requestJson(
    `/api/packages/${encodeURIComponent(owner)}/${encodeURIComponent(packageName)}/analysis`,
    packageAnalysisSchema
  );
}
