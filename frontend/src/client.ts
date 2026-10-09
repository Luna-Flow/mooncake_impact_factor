// Data access for the pages. The dynamic application asks its own API
// routes; the static site reads the JSON files exported to public/data and
// searches in a web worker. Both return the same shapes.

import { fetchStaticManifest, searchStaticPackagesPage } from "./static-api";
import {
  indexMetaSchema,
  packageAnalysisSchema,
  searchResultSchema,
  type IndexMeta,
  type PackageAnalysis,
  type SearchResult
} from "./types";
import { toApiParams, toStaticParams } from "./search-params";

export const DATA_MODE: "static" | "dynamic" = process.env["NEXT_PUBLIC_APP_MODE"] === "static" ? "static" : "dynamic";
const BASE_PATH = process.env["NEXT_PUBLIC_BASE_PATH"] ?? "";

export { PAGE_SIZE, QUERY_KEYS } from "./search-params";

async function requestJson<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parse(payload);
}

/** Static file name of a package: every `/` of the full name becomes `--`. */
export function packageFileKey(fullName: string): string {
  return fullName.replaceAll("/", "--");
}

export async function searchRegistry(query: URLSearchParams, page = 1): Promise<SearchResult> {
  if (DATA_MODE === "static") {
    return searchStaticPackagesPage(toStaticParams(query, page));
  }
  const url = `${BASE_PATH}/api/search?${new URLSearchParams(toApiParams(query, page)).toString()}`;
  return requestJson(url, (value) => searchResultSchema.parse(value));
}

export async function fetchPackage(fullName: string): Promise<PackageAnalysis> {
  if (DATA_MODE === "static") {
    return requestJson(`${BASE_PATH}/data/packages/${encodeURIComponent(packageFileKey(fullName))}.json`, (value) =>
      packageAnalysisSchema.parse(value)
    );
  }
  const path = fullName.split("/").map(encodeURIComponent).join("/");
  return requestJson(`${BASE_PATH}/api/packages/${path}`, (value) => packageAnalysisSchema.parse(value));
}

export async function fetchIndexMeta(): Promise<IndexMeta> {
  if (DATA_MODE === "static") {
    return (await fetchStaticManifest()).meta;
  }
  return requestJson(`${BASE_PATH}/api/meta`, (value) => indexMetaSchema.parse(value));
}
