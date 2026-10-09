// TypeScript face of the MoonBit static search engine (src/static_search),
// used by the search worker (frontend/src/static-search.worker.ts) and the
// tests. Evaluation, relevance, sorting and paging live in MoonBit.
// Run `npm run build:moonbit` to generate ./moonbit/static_search.
import type { StaticSearchIndexItem } from "../frontend/src/types";
import * as moonbit from "./moonbit/static_search/static_search.js";
import { unwrapEnvelope, type LegacySearchParamsShape, type QueryAst, type QueryNode } from "./query.js";

/** Search parameters of the web interface, as strings. */
export type StaticSearchParams = LegacySearchParamsShape;

/** One page of results: indices into the loaded index, and the match count. */
export type StaticSearchPage = {
  indices: number[];
  total: number;
};

/** Version tag of the MoonBit runtime, `"static-search-v2"`. */
export const STATIC_SEARCH_RUNTIME_VERSION: string = moonbit.runtime_version();

/**
 * Parses the index document (`{"items":[…]}`) and keeps it for
 * `searchStaticIndex`. Returns the number of items.
 */
export function loadStaticSearchIndex(indexJson: string): number {
  const count = moonbit.load_index(indexJson);
  if (count < 0) {
    throw new Error("Static search index has an unexpected shape");
  }
  return count;
}

/** Searches the loaded index; throws with the query error message. */
export function searchStaticIndex(params: StaticSearchParams): StaticSearchPage {
  return unwrapEnvelope<StaticSearchPage>(moonbit.search(JSON.stringify(params)));
}

function asAst(node: QueryNode): QueryAst {
  return node.kind === "group" ? node : { kind: "group", op: "and", children: [node] };
}

export function evaluateQueryNode(pkg: StaticSearchIndexItem, node: QueryNode): boolean {
  return unwrapEnvelope<boolean>(moonbit.evaluate_json(JSON.stringify(pkg), JSON.stringify(asAst(node))));
}

/** Positive term leaves matched; negated leaves never count (issue #4). */
export function computeStaticRelevance(pkg: StaticSearchIndexItem, ast: QueryAst): number {
  return unwrapEnvelope<number>(moonbit.relevance_json(JSON.stringify(pkg), JSON.stringify(ast)));
}

/** Lower-cases text the way the static search does, on every backend. */
export function normalizeSearchText(input: string): string {
  return moonbit.normalize_text(input);
}
