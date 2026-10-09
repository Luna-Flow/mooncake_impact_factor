import { loadStaticSearchIndex, searchStaticIndex } from "../../lib/static-search";
import type { AdvancedSearchParams } from "./api";
import { staticSearchIndexSchema, type StaticSearchIndexItem } from "./types";

// Message protocol:
//   -> { type: "init", id, indexUrl }          load search/search-index.json
//   <- { type: "ready", id }
//   -> { type: "search", id, params }          AdvancedSearchParams (strings)
//   <- { type: "result", id, items, total }    one page; total = matches before paging
//   <- { type: "error", id, message }
// The search itself (query derivation, filtering, relevance, sorting,
// paging) runs in the MoonBit engine behind lib/static-search.ts.
type WorkerRequest =
  | { type: "init"; id: number; indexUrl: string }
  | { type: "search"; id: number; params: Partial<AdvancedSearchParams> };

type WorkerResponse =
  | { type: "ready"; id: number }
  | { type: "result"; id: number; items: StaticSearchIndexItem[]; total: number }
  | { type: "error"; id: number; message: string };

let indexedPackages: StaticSearchIndexItem[] | null = null;

async function handleInit(id: number, indexUrl: string): Promise<WorkerResponse> {
  if (indexedPackages) {
    return { type: "ready", id };
  }
  const response = await fetch(indexUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load static search index: HTTP ${response.status}`);
  }
  const text = await response.text();
  const items = staticSearchIndexSchema.parse(JSON.parse(text)).items;
  loadStaticSearchIndex(text);
  indexedPackages = items;
  return { type: "ready", id };
}

function handleSearch(id: number, params: Partial<AdvancedSearchParams>): WorkerResponse {
  const packages = indexedPackages;
  if (!packages) {
    throw new Error("Static search worker is not initialized");
  }
  const page = searchStaticIndex(params);
  const items = page.indices.flatMap((index) => {
    const item = packages[index];
    return item ? [item] : [];
  });
  return { type: "result", id, items, total: page.total };
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
