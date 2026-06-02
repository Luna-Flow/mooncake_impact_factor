import { App } from "../../frontend/src/App";
import type { AdvancedSearchParams, FeedSource } from "../../frontend/src/api";
import { getFeedPackages, searchPackagesFromInput } from "../../lib/data";

export const dynamic = "force-dynamic";

type SearchParamRecord = Record<string, string | string[] | undefined>;

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
    order: first(params["order"]) as AdvancedSearchParams["order"]
  };
}

function hasInitialSearchIntent(params: Partial<AdvancedSearchParams>): boolean {
  return Object.values(params).some((value) => typeof value === "string" && value.trim().length > 0);
}

export default async function SearchPage(props: {
  searchParams?: Promise<SearchParamRecord>;
}) {
  const rawParams = props.searchParams ? await props.searchParams : {};
  const initialSource = normalizeSource(rawParams);
  const initialSearchParams = buildInitialParams(rawParams);

  const initialSearchItems = initialSource
    ? getFeedPackages(initialSource, initialSource === "top" ? 40 : 24)
    : hasInitialSearchIntent(initialSearchParams)
      ? searchPackagesFromInput({
          q: first(rawParams["q"]),
          owner: first(rawParams["owner"]),
          package: first(rawParams["package"]),
          keyword: first(rawParams["keyword"]),
          description: first(rawParams["description"]),
          license: first(rawParams["license"]),
          repository: first(rawParams["repository"]),
          rank: first(rawParams["rank"]),
          momentum: first(rawParams["momentum"]),
          min_score: first(rawParams["min_score"]),
          max_score: first(rawParams["max_score"]),
          min_dependents: first(rawParams["min_dependents"]),
          min_recent_dependents: first(rawParams["min_recent_dependents"]),
          min_downloads: first(rawParams["min_downloads"]),
          from_year: first(rawParams["from_year"]),
          to_year: first(rawParams["to_year"]),
          has_repository: first(rawParams["has_repository"]),
          has_license: first(rawParams["has_license"]),
          sort: first(rawParams["sort"]),
          order: first(rawParams["order"])
        })
      : [];

  return (
    <App
      initialTopPackages={[]}
      initialView="search"
      initialSource={initialSource}
      initialSearchParams={initialSearchParams}
      initialSearchItems={initialSearchItems}
    />
  );
}
