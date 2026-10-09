import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

import {
  getIndexMeta,
  getPackageAnalysis,
  isHttpError,
  resetDatabaseForTests,
  searchPackagesFromInput
} from "../lib/data.ts";
import { encodeQueryAst } from "../lib/query.ts";
import { expectedOrder, nameOf, ownerOf, searchPackages, SORT_KEYS } from "./fixtures/search-packages.mjs";

function createFixtureDatabase() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "mooncake-impact-test-"));
  const dbPath = path.join(tempDir, "mooncake.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE packages (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      package_name TEXT NOT NULL,
      description TEXT,
      repository TEXT,
      license TEXT,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      latest_version TEXT,
      latest_created_at TEXT,
      version_count INTEGER NOT NULL DEFAULT 0,
      dependent_count INTEGER NOT NULL DEFAULT 0,
      recent_dependent_count INTEGER NOT NULL DEFAULT 0,
      external_dependent_count INTEGER NOT NULL DEFAULT 0,
      self_dependent_count INTEGER NOT NULL DEFAULT 0,
      dependent_owner_count INTEGER NOT NULL DEFAULT 0,
      days_since_release INTEGER NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      download_count_30d_ago INTEGER
    );

    CREATE TABLE index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE versions (
      id INTEGER PRIMARY KEY,
      package_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      created_at TEXT,
      yanked INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      deps_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE package_edges (
      source_package_id INTEGER NOT NULL,
      target_package_id INTEGER NOT NULL,
      first_seen_at TEXT,
      same_owner INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (source_package_id, target_package_id)
    );

    CREATE TABLE package_scores (
      package_id INTEGER PRIMARY KEY,
      score REAL NOT NULL,
      score_30d_ago REAL NOT NULL,
      score_growth_30d REAL NOT NULL,
      score_growth_ratio_30d REAL NOT NULL,
      rank_label TEXT NOT NULL,
      momentum_label TEXT NOT NULL,
      activity_multiplier REAL NOT NULL,
      rank_position INTEGER NOT NULL DEFAULT 0,
      part_dependents REAL NOT NULL DEFAULT 0,
      part_recent_dependents REAL NOT NULL DEFAULT 0,
      part_downloads REAL NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE search_index USING fts5(
      full_name,
      owner,
      package_name,
      description,
      keywords,
      content=''
    );
  `);

  const insertPackage = db.prepare(`
    INSERT INTO packages (
      id, full_name, owner, package_name, description, repository, license,
      keywords_json, latest_version, latest_created_at, version_count,
      dependent_count, recent_dependent_count, external_dependent_count,
      dependent_owner_count, days_since_release, download_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `);
  const insertScore = db.prepare(`
    INSERT INTO package_scores (
      package_id, score, score_30d_ago, score_growth_30d, score_growth_ratio_30d,
      rank_label, momentum_label, activity_multiplier, rank_position, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, '2026-06-02T00:00:00+00:00')
  `);
  const insertText = db.prepare(`
    INSERT INTO search_index (rowid, full_name, owner, package_name, description, keywords)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const pkg of searchPackages) {
    insertPackage.run(
      pkg.id, pkg.full_name, ownerOf(pkg), nameOf(pkg), pkg.description, pkg.repository, pkg.license,
      JSON.stringify(pkg.keywords), pkg.latest_version, pkg.latest_created_at,
      pkg.dependent_count, pkg.recent_dependent_count, pkg.external_dependent_count,
      pkg.dependent_owner_count, pkg.days_since_release, pkg.download_count
    );
    insertScore.run(
      pkg.id, pkg.score, pkg.score_30d_ago, pkg.score_growth_30d, pkg.score_growth_ratio_30d,
      pkg.rank_label, pkg.momentum_label, pkg.rank_position
    );
    insertText.run(pkg.id, pkg.full_name, ownerOf(pkg), nameOf(pkg), pkg.description, pkg.keywords.join(" "));
  }

  db.exec(`
    -- MoonBit orders versions; the server returns them by position.
    INSERT INTO versions (id, package_id, version, created_at, yanked, position, deps_json) VALUES
      (10, 1, '1.9.0', NULL, 0, 2, '{}'),
      (12, 1, '1.10.0', NULL, 0, 0, '{}'),
      (11, 1, '1.10.0-rc1', NULL, 1, 1, '{}'),
      (20, 2, '0.4.0', '2026-01-01T00:00:00+00:00', 0, 0, '{"alice/toolkit": "1.10.0", "local/thing": {"path": "../thing"}}');

    INSERT INTO package_edges (source_package_id, target_package_id, first_seen_at, same_owner) VALUES
      (2, 1, '2026-02-01T00:00:00+00:00', 0);

    INSERT INTO index_meta (key, value) VALUES
      ('computed_at', '2026-06-02T00:00:00.000Z'),
      ('population', '5'),
      ('download_history_used', 'false'),
      ('top_score', '250.5'),
      ('rank_counts', '{"A":2,"S":1}'),
      ('momentum_counts', '{"New":1,"Stable":4}');

  `);

  db.close();
  return { dbPath, tempDir };
}

function withFixture(run) {
  const { dbPath, tempDir } = createFixtureDatabase();
  const previousPath = process.env.MOONCAKE_DB_PATH;
  process.env.MOONCAKE_DB_PATH = dbPath;
  resetDatabaseForTests();

  try {
    run();
  } finally {
    resetDatabaseForTests();
    if (previousPath === undefined) {
      delete process.env.MOONCAKE_DB_PATH;
    } else {
      process.env.MOONCAKE_DB_PATH = previousPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("rejects malformed FTS queries with HttpError 400", () => {
  withFixture(() => {
    for (const query of ["AND", "foo AND", "\"foo", "( foo"]) {
      assert.throws(
        () => searchPackagesFromInput({ q: query }),
        (error) => isHttpError(error) && error.status === 400
      );
    }
  });
});

test("accepts valid FTS queries", () => {
  withFixture(() => {
    const { items } = searchPackagesFromInput({ q: "owner:alice AND package:toolkit" });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.full_name, "alice/toolkit");

    const { items: excluded } = searchPackagesFromInput({ q: "toolkit NOT helper" });
    assert.equal(excluded.length, 1);
    assert.equal(excluded[0]?.full_name, "alice/toolkit");
  });
});

test("package analysis sorts versions by semver when timestamps tie", () => {
  withFixture(() => {
    const analysis = getPackageAnalysis("alice/toolkit");
    assert.deepEqual(
      analysis.detail.versions.map((version) => [version.version, version.yanked]),
      [["1.10.0", false], ["1.10.0-rc1", true], ["1.9.0", false]]
    );
    assert.deepEqual(
      analysis.dependents.map((item) => [item.full_name, item.same_owner]),
      [["bob/helper", false]]
    );
    assert.deepEqual(
      analysis.dependencies,
      []
    );
    const helper = getPackageAnalysis("bob/helper");
    assert.deepEqual(
      helper.dependencies.map((item) => [item.full_name, item.in_registry, item.version_req]),
      [["alice/toolkit", true, "1.10.0"], ["local/thing", false, null]]
    );
  });
});

test("reports the index metadata", () => {
  withFixture(() => {
    assert.deepEqual(getIndexMeta(), {
      computed_at: "2026-06-02T00:00:00.000Z",
      population: 5,
      download_history_used: false,
      top_score: 250.5,
      rank_counts: { A: 2, S: 1 },
      momentum_counts: { New: 1, Stable: 4 }
    });
  });
});

test("supports native expression search input", () => {
  withFixture(() => {
    const { items } = searchPackagesFromInput({
      expr: "(owner:alice OR keyword:helper) AND score>=80"
    });
    assert.deepEqual(
      items.map((item) => item.full_name),
      ["alice/toolkit", "bob/helper"]
    );
  });
});

test("supports serialized AST search input", () => {
  withFixture(() => {
    const ast = encodeQueryAst({
      kind: "group",
      op: "and",
      children: [
        {
          kind: "group",
          op: "or",
          children: [
            { kind: "term", field: "owner", operator: "match", value: "alice" },
            { kind: "term", field: "keyword", operator: "match", value: "helper" }
          ]
        },
        { kind: "term", field: "score", operator: "gte", value: "80" }
      ]
    });

    const { items } = searchPackagesFromInput({ ast });
    assert.deepEqual(
      items.map((item) => item.full_name),
      ["alice/toolkit", "bob/helper"]
    );
  });
});

function names(page) {
  return page.items.map((item) => item.full_name);
}

test("lists every package by rank position without criteria", () => {
  withFixture(() => {
    const page = searchPackagesFromInput({});
    assert.deepEqual(names(page), ["alice/toolkit", "carol/csv", "dave/yaml", "erin/zip", "bob/helper"]);
    assert.equal(page.total, 5);
  });
});

test("pages with limit and offset and reports the total", () => {
  withFixture(() => {
    const first = searchPackagesFromInput({ limit: "2" });
    assert.deepEqual(names(first), ["alice/toolkit", "carol/csv"]);
    assert.equal(first.total, 5);
    const second = searchPackagesFromInput({ limit: 2, offset: 2 });
    assert.deepEqual(names(second), ["dave/yaml", "erin/zip"]);
    assert.equal(second.total, 5);
    const beyond = searchPackagesFromInput({ offset: "9" });
    assert.deepEqual(names(beyond), []);
    assert.equal(beyond.total, 5);
    const filtered = searchPackagesFromInput({ min_score: "100", limit: "1", offset: "1" });
    assert.deepEqual(names(filtered), ["carol/csv"]);
    assert.equal(filtered.total, 4);
  });
});

test("rank and momentum accept comma-separated lists", () => {
  withFixture(() => {
    assert.deepEqual(names(searchPackagesFromInput({ rank: "a,c", sort: "name" })), ["alice/toolkit", "bob/helper"]);
    assert.deepEqual(names(searchPackagesFromInput({ momentum: "new" })), ["bob/helper"]);
    assert.deepEqual(names(searchPackagesFromInput({ momentum: "stable,COOLING" })), ["carol/csv", "dave/yaml", "erin/zip"]);
    for (const input of [{ rank: "S,X" }, { momentum: "Hot" }, { expr: "rank=Z" }]) {
      assert.throws(
        () => searchPackagesFromInput(input),
        (error) => isHttpError(error) && error.status === 400 && /must be one of/.test(error.message)
      );
    }
  });
});

test("filters by the scoring v2 columns", () => {
  withFixture(() => {
    assert.deepEqual(names(searchPackagesFromInput({ min_external_dependents: "1" })), ["alice/toolkit", "carol/csv"]);
    assert.deepEqual(names(searchPackagesFromInput({ min_owners: "2" })), ["carol/csv"]);
    assert.deepEqual(names(searchPackagesFromInput({ max_age: "30" })), ["carol/csv", "bob/helper"]);
    assert.deepEqual(
      names(searchPackagesFromInput({ expr: "position<=1 OR age<=30" })),
      ["alice/toolkit", "carol/csv", "bob/helper"]
    );
  });
});

const SORT_CRITERIA = [
  { label: "no criteria", input: {}, matches: () => true },
  { label: "flat criteria", input: { min_score: "100" }, matches: (pkg) => pkg.score >= 100 },
  { label: "query tree", input: { expr: "score>=100 OR owner:bob" }, matches: () => true }
];

for (const criteria of SORT_CRITERIA) {
  for (const sort of SORT_KEYS) {
    for (const order of ["", "asc", "desc"]) {
      test(`sort=${sort} order=${order || "default"} with ${criteria.label}`, () => {
        withFixture(() => {
          const page = searchPackagesFromInput({ ...criteria.input, sort, order });
          const expected = expectedOrder(searchPackages.filter(criteria.matches), sort, order);
          assert.deepEqual(names(page), expected);
          assert.equal(page.total, expected.length);
        });
      });
    }
  }
}

test("malformed query trees are HTTP 400", () => {
  withFixture(() => {
    for (const input of [{ ast: "{" }, { expr: "owner:" }, { sort: "constructor" }, { order: "up" }]) {
      assert.throws(
        () => searchPackagesFromInput(input),
        (error) => isHttpError(error) && error.status === 400
      );
    }
  });
});
