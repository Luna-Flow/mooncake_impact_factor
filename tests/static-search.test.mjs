import test from "node:test";
import assert from "node:assert/strict";

import { parseNativeExpression } from "../lib/query.ts";
import { computeStaticRelevance, evaluateQueryNode } from "../lib/static-search.ts";

function item(fullName, rankLabel, text, score) {
  const [owner, packageName] = fullName.split("/");
  return {
    full_name: fullName,
    owner,
    package_name: packageName,
    score,
    rank_label: rankLabel,
    momentum_label: "Stable",
    dependent_count: 0,
    recent_dependent_count: 0,
    download_count: 0,
    latest_created_at: "2026-01-01T00:00:00Z",
    repository_present: false,
    license_present: false,
    normalized_full_text: `${fullName} ${owner} ${packageName} ${text}`.toLowerCase(),
    normalized_owner: owner,
    normalized_package: packageName,
    normalized_description: text.toLowerCase(),
    normalized_license: "",
    normalized_repository: "",
    normalized_keywords: []
  };
}

const packages = [
  item("dave/jsond", "D", "json parser", 10),
  item("alice/json", "A", "json parser", 200),
  item("carol/csv", "A", "csv reader", 190)
];

function relevance(expression) {
  const ast = parseNativeExpression(expression);
  return Object.fromEntries(packages.map((pkg) => [pkg.full_name, computeStaticRelevance(pkg, ast)]));
}

test("negated leaves under OR add no relevance (issue #4)", () => {
  assert.deepEqual(relevance("NOT rank=D OR json"), {
    "dave/jsond": 1,
    "alice/json": 1,
    "carol/csv": 0
  });
});

test("leaves below a negated group add no relevance", () => {
  assert.deepEqual(relevance("NOT (rank=D OR csv) OR json"), {
    "dave/jsond": 1,
    "alice/json": 1,
    "carol/csv": 0
  });
});

test("positive leaves are still counted", () => {
  assert.deepEqual(relevance("json OR parser OR csv"), {
    "dave/jsond": 2,
    "alice/json": 2,
    "carol/csv": 1
  });
});

test("negation still filters", () => {
  const ast = parseNativeExpression("NOT rank=D OR json");
  const matched = packages.filter((pkg) => evaluateQueryNode(pkg, ast)).map((pkg) => pkg.full_name);
  assert.deepEqual(matched, ["dave/jsond", "alice/json", "carol/csv"]);
  const strict = parseNativeExpression("json AND NOT rank=D");
  assert.deepEqual(packages.filter((pkg) => evaluateQueryNode(pkg, strict)).map((pkg) => pkg.full_name), ["alice/json"]);
});
