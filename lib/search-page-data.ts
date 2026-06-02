import type { AdvancedSearchParams, FeedSource } from "../frontend/src/api";
import { getFeedPackages, isHttpError, searchPackagesFromInput } from "./data";

export type SearchParamRecord = Record<string, string | string[] | undefined>;

export type SearchPageData = {
  initialSource: FeedSource | null;
  initialSearchParams: Partial<AdvancedSearchParams>;
  initialSearchItems: ReturnType<typeof searchPackagesFromInput>;
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
    minDownloads: first(params["min_downloads"]),
    fromYear: first(params["from_year"]),
    toYear: first(params["to_year"]),
    hasRepository: first(params["has_repository"]) as AdvancedSearchParams["hasRepository"],
    hasLicense: first(params["has_license"]) as AdvancedSearchParams["hasLicense"],
    sort: first(params["sort"]) as AdvancedSearchParams["sort"],
    order: first(params["order"]) as AdvancedSearchParams["order"],
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

  let initialSearchItems: ReturnType<typeof searchPackagesFromInput> = [];
  try {
    initialSearchItems = initialSource
      ? getFeedPackages(initialSource, initialSource === "top" ? 40 : 24)
      : hasInitialSearchIntent(initialSearchParams)
        ? searchPackagesFromInput({
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
            min_downloads: first(params["min_downloads"]),
            from_year: first(params["from_year"]),
            to_year: first(params["to_year"]),
            has_repository: first(params["has_repository"]),
            has_license: first(params["has_license"]),
            sort: first(params["sort"]),
            order: first(params["order"]),
            expr: first(params["expr"]),
            ast: first(params["ast"])
          })
        : [];
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
    initialSearchError
  };
}
