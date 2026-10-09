import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { QUERY_KEYS, toApiParams, toStaticParams } from "../frontend/src/search-params.ts";

// The fields of AdvancedSearchParams, read from DEFAULT_SEARCH_PARAMS in
// frontend/src/api.ts (which Node cannot import without the bundler).
const api = readFileSync(new URL("../frontend/src/api.ts", import.meta.url), "utf8");
const defaults = api.slice(api.indexOf("DEFAULT_SEARCH_PARAMS"));
const FIELDS = new Set([...defaults.slice(0, defaults.indexOf("};")).matchAll(/^  (\w+):/gm)].map((match) => match[1]));

// The rankings keep their filters in URL parameters spelled like /api/search.
// The static worker reads AdvancedSearchParams, so every parameter must map
// to one of its fields; an unmapped one would be ignored silently.
test("every URL parameter reaches the static search", () => {
  const query = new URLSearchParams(QUERY_KEYS.map((key) => [key, `value-of-${key}`]));
  const params = toStaticParams(query, 3);
  for (const key of QUERY_KEYS) {
    const field = Object.entries(params).find(([, value]) => value === `value-of-${key}`)?.[0];
    assert.ok(field, `${key} is not passed to the static search`);
    assert.ok(FIELDS.has(field), `${key} maps to ${field}, which is not a search field`);
  }
  assert.equal(params.limit, "50");
  assert.equal(params.offset, "100");
});

test("the server receives the URL parameters unchanged", () => {
  const query = new URLSearchParams({ max_age: "90", rank: "S,A", page: "2", unknown: "x" });
  assert.deepEqual(toApiParams(query, 2), { rank: "S,A", max_age: "90", limit: "50", offset: "50" });
});
