// The URL parameters of the rankings and how each search receives them. The
// parameters are spelled like those of /api/search, so the dynamic site
// passes them through; the static worker reads AdvancedSearchParams, whose
// field names differ. This module has no runtime imports so that Node can
// test it directly.

import type { AdvancedSearchParams } from "./api";

/** URL parameters the rankings understand, in the spelling of the API. */
export const QUERY_KEYS = [
  "q",
  "expr",
  "rank",
  "momentum",
  "min_external_dependents",
  "min_owners",
  "max_age",
  "has_repository",
  "has_license",
  "sort",
  "order"
] as const;

export const PAGE_SIZE = 50;

/** URL parameter names of the API and the fields of AdvancedSearchParams. */
const STATIC_PARAM_NAMES: Record<(typeof QUERY_KEYS)[number], keyof AdvancedSearchParams> = {
  q: "q",
  expr: "expr",
  rank: "rank",
  momentum: "momentum",
  min_external_dependents: "minExternalDependents",
  min_owners: "minOwners",
  max_age: "maxAge",
  has_repository: "hasRepository",
  has_license: "hasLicense",
  sort: "sort",
  order: "order"
};

function pickQuery(query: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = query.get(key);
    if (value) params[key] = value;
  }
  return params;
}

/** The URL parameters as the server's /api/search reads them. */
export function toApiParams(query: URLSearchParams, page: number): Record<string, string> {
  return { ...pickQuery(query), limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) };
}

/** The same request as AdvancedSearchParams, which the static worker reads. */
export function toStaticParams(query: URLSearchParams, page: number): Partial<AdvancedSearchParams> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(pickQuery(query))) {
    params[STATIC_PARAM_NAMES[key as (typeof QUERY_KEYS)[number]]] = value;
  }
  params["limit"] = String(PAGE_SIZE);
  params["offset"] = String((page - 1) * PAGE_SIZE);
  return params as Partial<AdvancedSearchParams>;
}

