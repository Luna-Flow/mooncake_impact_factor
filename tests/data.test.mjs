import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

import {
  getPackageAnalysis,
  isHttpError,
  resetDatabaseForTests,
  searchPackagesFromInput
} from "../lib/data.ts";
import { encodeQueryAst } from "../lib/query.ts";

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
      download_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE versions (
      id INTEGER PRIMARY KEY,
      package_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      created_at TEXT,
      deps_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE package_edges (
      source_package_id INTEGER NOT NULL,
      target_package_id INTEGER NOT NULL,
      first_seen_at TEXT,
      latest_version_id INTEGER,
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

  db.exec(`
    INSERT INTO packages (
      id, full_name, owner, package_name, description, repository, license,
      keywords_json, latest_version, latest_created_at, version_count,
      dependent_count, recent_dependent_count, download_count
    ) VALUES
      (1, 'alice/toolkit', 'alice', 'toolkit', 'alpha toolkit package', 'https://example.com/toolkit', 'MIT', '["alpha","tooling"]', '1.10.0', NULL, 3, 9, 4, 1200),
      (2, 'bob/helper', 'bob', 'helper', 'helper package', NULL, 'Apache-2.0', '["helper"]', '0.4.0', '2026-01-01T00:00:00+00:00', 1, 0, 0, 100);

    INSERT INTO package_scores (
      package_id, score, score_30d_ago, score_growth_30d, score_growth_ratio_30d,
      rank_label, momentum_label, activity_multiplier, computed_at
    ) VALUES
      (1, 210.0, 120.0, 90.0, 0.75, 'A', 'Rising', 1.06, '2026-06-02T00:00:00+00:00'),
      (2, 80.0, 75.0, 5.0, 0.066, 'C', 'Stable', 1.00, '2026-06-02T00:00:00+00:00');

    INSERT INTO versions (id, package_id, version, created_at, deps_json) VALUES
      (10, 1, '1.9.0', NULL, '{}'),
      (11, 1, '1.10.0-rc1', NULL, '{}'),
      (12, 1, '1.10.0', NULL, '{}'),
      (20, 2, '0.4.0', '2026-01-01T00:00:00+00:00', '{}');

    INSERT INTO package_edges (source_package_id, target_package_id, first_seen_at, latest_version_id) VALUES
      (2, 1, '2026-02-01T00:00:00+00:00', 20);

    INSERT INTO search_index (rowid, full_name, owner, package_name, description, keywords) VALUES
      (1, 'alice/toolkit', 'alice', 'toolkit', 'alpha toolkit package', 'alpha tooling'),
      (2, 'bob/helper', 'bob', 'helper', 'helper package', 'helper');
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
    const items = searchPackagesFromInput({ q: "owner:alice AND package:toolkit" });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.full_name, "alice/toolkit");

    const excluded = searchPackagesFromInput({ q: "toolkit NOT helper" });
    assert.equal(excluded.length, 1);
    assert.equal(excluded[0]?.full_name, "alice/toolkit");
  });
});

test("package analysis sorts versions by semver when timestamps tie", () => {
  withFixture(() => {
    const analysis = getPackageAnalysis("alice", "toolkit");
    assert.deepEqual(
      analysis.detail.versions.map((version) => version.version),
      ["1.10.0", "1.10.0-rc1", "1.9.0"]
    );
  });
});

test("supports native expression search input", () => {
  withFixture(() => {
    const items = searchPackagesFromInput({
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

    const items = searchPackagesFromInput({ ast });
    assert.deepEqual(
      items.map((item) => item.full_name),
      ["alice/toolkit", "bob/helper"]
    );
  });
});
