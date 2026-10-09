import type { AdvancedSearchParams, FeedSource } from "../frontend/src/api";
import { getFeedPackages, isHttpError, searchPackagesFromInput } from "./data";
import type { PackageSummary } from "../frontend/src/types";

export type SearchParamRecord = Record<string, string | string[] | undefined>;

export type SearchPageData = {
  initialSource: FeedSource | null;
  initialSearchParams: Partial<AdvancedSearchParams>;
  initialSearchItems: PackageSummary[];
  /** Matches before paging, or null for a feed or no search. */
  initialSearchTotal: number | null;
  initialSearchError: string | null;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeSource(params: SearchParamRecord): FeedSource | null {
  const source = first(params["source"]);
  if (source === "top" || source === "hot" || source === "rising") {
    return source;
  }
  return null;
}

function buildInitialParams(params: SearchParamRecord): Partial<AdvancedSearchParams> {
  return {
    q: first(params["q"]),
    owner: first(params["owner"]),
    packageName: first(params["package"]),
    keyword: first(params["keyword"]),
    description: first(params["description"]),
    license: first(params["license"]),
    repository: first(params["repository"]),
    rank: first(params["rank"]) as AdvancedSearchParams["rank"],
    momentum: first(params["momentum"]) as AdvancedSearchParams["momentum"],
    minScore: first(params["min_score"]),
    maxScore: first(params["max_score"]),
    minDependents: first(params["min_dependents"]),
    minRecentDependents: first(params["min_recent_dependents"]),
    minExternalDependents: first(params["min_external_dependents"]),
    minOwners: first(params["min_owners"]),
    maxAge: first(params["max_age"]),
    minDownloads: first(params["min_downloads"]),
    fromYear: first(params["from_year"]),
    toYear: first(params["to_year"]),
    hasRepository: first(params["has_repository"]) as AdvancedSearchParams["hasRepository"],
    hasLicense: first(params["has_license"]) as AdvancedSearchParams["hasLicense"],
    sort: first(params["sort"]) as AdvancedSearchParams["sort"],
    order: first(params["order"]) as AdvancedSearchParams["order"],
    limit: first(params["limit"]),
    offset: first(params["offset"]),
    expr: first(params["expr"]),
    ast: first(params["ast"])
  };
}

function hasInitialSearchIntent(params: Partial<AdvancedSearchParams>): boolean {
  return Object.values(params).some((value) => typeof value === "string" && value.trim().length > 0);
}

export function getSearchPageData(params: SearchParamRecord): SearchPageData {
  const initialSource = normalizeSource(params);
  const initialSearchParams = buildInitialParams(params);
  let initialSearchError: string | null = null;

  let initialSearchItems: PackageSummary[] = [];
  let initialSearchTotal: number | null = null;
  try {
    if (initialSource) {
      initialSearchItems = getFeedPackages(initialSource, initialSource === "top" ? 40 : 24);
    } else if (hasInitialSearchIntent(initialSearchParams)) {
      const page = searchPackagesFromInput({
            q: first(params["q"]),
            owner: first(params["owner"]),
            package: first(params["package"]),
            keyword: first(params["keyword"]),
            description: first(params["description"]),
            license: first(params["license"]),
            repository: first(params["repository"]),
            rank: first(params["rank"]),
            momentum: first(params["momentum"]),
            min_score: first(params["min_score"]),
            max_score: first(params["max_score"]),
            min_dependents: first(params["min_dependents"]),
            min_recent_dependents: first(params["min_recent_dependents"]),
            min_external_dependents: first(params["min_external_dependents"]),
            min_owners: first(params["min_owners"]),
            max_age: first(params["max_age"]),
            min_downloads: first(params["min_downloads"]),
            from_year: first(params["from_year"]),
            to_year: first(params["to_year"]),
            has_repository: first(params["has_repository"]),
            has_license: first(params["has_license"]),
            sort: first(params["sort"]),
            order: first(params["order"]),
            limit: first(params["limit"]),
            offset: first(params["offset"]),
            expr: first(params["expr"]),
            ast: first(params["ast"])
          });
      initialSearchItems = page.items;
      initialSearchTotal = page.total;
    }
  } catch (error: unknown) {
    if (!isHttpError(error)) {
      throw error;
    }
    initialSearchError = error.message;
  }

  return {
    initialSource,
    initialSearchParams,
    initialSearchItems,
    initialSearchTotal,
    initialSearchError
  };
}
