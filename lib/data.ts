import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { DependentItem, PackageDetail, PackageSummary, PackageVersion } from "../frontend/src/types";
import type { FeedSource } from "../frontend/src/api";
import { unwrapEnvelope } from "./query.js";
import * as querySql from "./moonbit/query_sql/query_sql.js";

/** URL parameters of `/api/search`; see `plan_search` in src/query_sql. */
type SearchInput = {
  q?: string | null;
  limit?: string | number | null;
  offset?: string | number | null;
  owner?: string | null;
  package?: string | null;
  keyword?: string | null;
  description?: string | null;
  license?: string | null;
  repository?: string | null;
  rank?: string | null;
  momentum?: string | null;
  min_score?: string | number | null;
  max_score?: string | number | null;
  min_dependents?: string | number | null;
  min_recent_dependents?: string | number | null;
  min_external_dependents?: string | number | null;
  min_owners?: string | number | null;
  max_age?: string | number | null;
  min_downloads?: string | number | null;
  from_year?: string | number | null;
  to_year?: string | number | null;
  has_repository?: string | null;
  has_license?: string | null;
  sort?: string | null;
  order?: string | null;
  expr?: string | null;
  ast?: string | null;
};

/** One page of search results; `total` counts the matches before paging. */
export type SearchPage = {
  items: PackageSummary[];
  total: number;
};

/** How MoonBit's `plan_search` says to run a search. */
type SearchPlan = {
  from: string;
  where: string;
  values: Array<string | number>;
  orderBy: string;
  limit: number;
  offset: number;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RowRecord = Record<string, unknown>;

let database: DatabaseSync | null = null;

function getDatabasePath(): string {
  const dbPath = process.env["MOONCAKE_DB_PATH"] ?? path.join(process.cwd(), "data", "mooncake.db");
  if (!existsSync(dbPath)) {
    throw new HttpError(500, `Database not found at ${dbPath}`);
  }
  return dbPath;
}

function getDatabase(): DatabaseSync {
  if (database) return database;
  database = new DatabaseSync(getDatabasePath());
  return database;
}

function clampLimit(value: string | number | null | undefined, maximum: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), maximum);
}

function toEpochMillis(value: string | null): number {
  if (!value) return 0;
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? 0 : epoch;
}

function parseSemverKey(version: string | null): readonly [readonly [number, number, number], readonly [number, readonly (readonly [number, number | string])[]]] {
  if (!version) {
    return [[0, 0, 0], [0, []]];
  }

  const splitVersion = version.split("-", 2);
  const coreText = splitVersion[0] ?? "";
  const prereleaseText = splitVersion[1] ?? "";
  const coreParts = coreText.split(".");
  const coreNumbers: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < 3; index += 1) {
    const part = coreParts[index] ?? "";
    coreNumbers[index] = /^\d+$/.test(part) ? Number(part) : 0;
  }

  if (!prereleaseText) {
    return [coreNumbers, [1, []]];
  }

  const prereleaseParts = prereleaseText.split(".").map((identifier) => (
    /^\d+$/.test(identifier)
      ? [0, Number(identifier)] as const
      : [1, identifier] as const
  ));
  return [coreNumbers, [0, prereleaseParts]];
}

function compareSemverDesc(left: string | null, right: string | null): number {
  const leftKey = parseSemverKey(left);
  const rightKey = parseSemverKey(right);

  for (let index = 0; index < 3; index += 1) {
    const leftCore = leftKey[0][index] ?? 0;
    const rightCore = rightKey[0][index] ?? 0;
    if (leftCore !== rightCore) {
      return rightCore - leftCore;
    }
  }

  if (leftKey[1][0] !== rightKey[1][0]) {
    return rightKey[1][0] - leftKey[1][0];
  }

  const maxLength = Math.max(leftKey[1][1].length, rightKey[1][1].length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftKey[1][1][index];
    const rightPart = rightKey[1][1][index];
    if (!leftPart) return 1;
    if (!rightPart) return -1;
    if (leftPart[0] !== rightPart[0]) {
      return rightPart[0] - leftPart[0];
    }
    if (leftPart[1] === rightPart[1]) continue;
    if (typeof leftPart[1] === "number" && typeof rightPart[1] === "number") {
      return rightPart[1] - leftPart[1];
    }
    return String(rightPart[1]).localeCompare(String(leftPart[1]));
  }

  return 0;
}

function sortVersionsDescending(versions: PackageVersion[]): PackageVersion[] {
  return [...versions].sort((left, right) => {
    const createdAtOrder = toEpochMillis(right.created_at) - toEpochMillis(left.created_at);
    if (createdAtOrder !== 0) {
      return createdAtOrder;
    }
    return compareSemverDesc(left.version, right.version);
  });
}

function normalizeSqliteSearchError(error: unknown): never {
  if (error instanceof HttpError) {
    throw error;
  }
  if (error instanceof Error && error.message.includes("fts5:")) {
    throw new HttpError(400, "Invalid full-text search syntax");
  }
  throw error;
}

function mapPackageSummary(row: RowRecord): PackageSummary {
  return {
    full_name: String(row["full_name"] ?? ""),
    owner: String(row["owner"] ?? ""),
    package_name: String(row["package_name"] ?? ""),
    description: row["description"] === null ? null : String(row["description"] ?? ""),
    latest_version: row["latest_version"] === null ? null : String(row["latest_version"] ?? ""),
    dependent_count: Number(row["dependent_count"] ?? 0),
    recent_dependent_count: Number(row["recent_dependent_count"] ?? 0),
    download_count: Number(row["download_count"] ?? 0),
    score: Number(row["score"] ?? 0),
    score_30d_ago: Number(row["score_30d_ago"] ?? 0),
    score_growth_30d: Number(row["score_growth_30d"] ?? 0),
    score_growth_ratio_30d: Number(row["score_growth_ratio_30d"] ?? 0),
    rank_label: String(row["rank_label"] ?? ""),
    momentum_label: String(row["momentum_label"] ?? "")
  };
}

function mapDependentItem(row: RowRecord): DependentItem {
  return {
    full_name: String(row["full_name"] ?? ""),
    owner: String(row["owner"] ?? ""),
    package_name: String(row["package_name"] ?? ""),
    description: row["description"] === null ? null : String(row["description"] ?? ""),
    latest_version: row["latest_version"] === null ? null : String(row["latest_version"] ?? ""),
    score: Number(row["score"] ?? 0),
    rank_label: String(row["rank_label"] ?? ""),
    momentum_label: String(row["momentum_label"] ?? "")
  };
}

function mapVersion(row: RowRecord): PackageVersion {
  return {
    version: String(row["version"] ?? ""),
    created_at: row["created_at"] === null ? null : String(row["created_at"] ?? ""),
    deps: JSON.parse(String(row["deps_json"] ?? "[]"))
  };
}

function mapPackageDetail(row: RowRecord): PackageDetail {
  return {
    full_name: String(row["full_name"] ?? ""),
    owner: String(row["owner"] ?? ""),
    package_name: String(row["package_name"] ?? ""),
    description: row["description"] === null ? null : String(row["description"] ?? ""),
    repository: row["repository"] === null ? null : String(row["repository"] ?? ""),
    license: row["license"] === null ? null : String(row["license"] ?? ""),
    latest_version: row["latest_version"] === null ? null : String(row["latest_version"] ?? ""),
    latest_created_at: row["latest_created_at"] === null ? null : String(row["latest_created_at"] ?? ""),
    version_count: Number(row["version_count"] ?? 0),
    dependent_count: Number(row["dependent_count"] ?? 0),
    recent_dependent_count: Number(row["recent_dependent_count"] ?? 0),
    download_count: Number(row["download_count"] ?? 0),
    score: Number(row["score"] ?? 0),
    score_30d_ago: Number(row["score_30d_ago"] ?? 0),
    score_growth_30d: Number(row["score_growth_30d"] ?? 0),
    score_growth_ratio_30d: Number(row["score_growth_ratio_30d"] ?? 0),
    rank_label: String(row["rank_label"] ?? ""),
    momentum_label: String(row["momentum_label"] ?? ""),
    activity_multiplier: Number(row["activity_multiplier"] ?? 0),
    keywords: JSON.parse(String(row["keywords_json"] ?? "[]")),
    versions: []
  };
}

export function getFeedPackages(source: FeedSource, limit = 40): PackageSummary[] {
  const clampedLimit = clampLimit(limit, source === "top" ? 200 : 100, source === "top" ? 40 : 24);
  const db = getDatabase();
  let sql = `
    SELECT
      p.full_name,
      p.owner,
      p.package_name,
      p.description,
      p.latest_version,
      p.dependent_count,
      p.recent_dependent_count,
      p.download_count,
      s.score,
      s.score_30d_ago,
      s.score_growth_30d,
      s.score_growth_ratio_30d,
      s.rank_label,
      s.momentum_label
    FROM packages p
    JOIN package_scores s ON s.package_id = p.id
  `;
  const params: Array<string | number> = [];

  if (source === "hot") {
    sql += "WHERE s.momentum_label = ? ORDER BY s.score_growth_30d DESC, s.score DESC, p.full_name ASC LIMIT ?";
    params.push("Hot", clampedLimit);
  } else if (source === "rising") {
    sql += "WHERE s.momentum_label = ? ORDER BY s.score_growth_30d DESC, s.score DESC, p.full_name ASC LIMIT ?";
    params.push("Rising", clampedLimit);
  } else {
    sql += "ORDER BY s.score DESC, p.full_name ASC LIMIT ?";
    params.push(clampedLimit);
  }

  return (db.prepare(sql).all(...params) as RowRecord[]).map(mapPackageSummary);
}

const SUMMARY_COLUMNS = `
      p.full_name,
      p.owner,
      p.package_name,
      p.description,
      p.latest_version,
      p.dependent_count,
      p.recent_dependent_count,
      p.download_count,
      s.score,
      s.score_30d_ago,
      s.score_growth_30d,
      s.score_growth_ratio_30d,
      s.rank_label,
      s.momentum_label`;

/**
 * Plans the search in MoonBit (validation, query tree or FTS5 compilation,
 * ordering, paging) and turns its errors into HTTP 400.
 */
function planSearch(input: SearchInput): SearchPlan {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) {
      params[key] = String(value);
    }
  }
  try {
    return unwrapEnvelope<SearchPlan>(querySql.plan_search_json(JSON.stringify(params)));
  } catch (error: unknown) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid search request");
  }
}

/**
 * Runs a search. Without any criterion it lists every package by rank
 * position. Returns one page and the number of matches before paging.
 */
export function searchPackagesFromInput(input: SearchInput): SearchPage {
  try {
    const plan = planSearch(input);
    const db = getDatabase();
    const items = (
      db
        .prepare(`SELECT ${SUMMARY_COLUMNS}\n    FROM ${plan.from}\n    WHERE ${plan.where}\n    ORDER BY ${plan.orderBy}\n    LIMIT ? OFFSET ?`)
        .all(...plan.values, plan.limit, plan.offset) as RowRecord[]
    ).map(mapPackageSummary);
    const counted = db
      .prepare(`SELECT COUNT(*) AS total FROM ${plan.from} WHERE ${plan.where}`)
      .get(...plan.values) as RowRecord | undefined;
    return { items, total: Number(counted?.["total"] ?? 0) };
  } catch (error: unknown) {
    normalizeSqliteSearchError(error);
  }
}

export function getPackageAnalysis(owner: string, packageName: string): { detail: PackageDetail; dependents: DependentItem[] } {
  const db = getDatabase();
  const detailRow = db.prepare(`
    SELECT
      p.id,
      p.full_name,
      p.owner,
      p.package_name,
      p.description,
      p.repository,
      p.license,
      p.latest_version,
      p.latest_created_at,
      p.version_count,
      p.dependent_count,
      p.recent_dependent_count,
      p.download_count,
      p.keywords_json,
      s.score,
      s.score_30d_ago,
      s.score_growth_30d,
      s.score_growth_ratio_30d,
      s.rank_label,
      s.momentum_label,
      s.activity_multiplier
    FROM packages p
    JOIN package_scores s ON s.package_id = p.id
    WHERE p.owner = ? AND p.package_name = ?
  `).get(owner, packageName) as RowRecord | undefined;

  if (!detailRow) {
    throw new HttpError(404, "Package not found");
  }

  const detail = mapPackageDetail(detailRow);
  const packageId = Number(detailRow["id"]);

  detail.versions = sortVersionsDescending((db.prepare(`
    SELECT version, created_at, deps_json
    FROM versions
    WHERE package_id = ?
    ORDER BY created_at DESC, version DESC
    LIMIT 20
  `).all(packageId) as RowRecord[]).map(mapVersion));

  const dependents = (db.prepare(`
    SELECT
      p.full_name,
      p.owner,
      p.package_name,
      p.description,
      p.latest_version,
      s.score,
      s.rank_label,
      s.momentum_label
    FROM package_edges e
    JOIN packages p ON p.id = e.source_package_id
    JOIN package_scores s ON s.package_id = p.id
    WHERE e.target_package_id = ?
    ORDER BY s.score DESC, p.full_name ASC
  `).all(packageId) as RowRecord[]).map(mapDependentItem);

  return { detail, dependents };
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function resetDatabaseForTests(): void {
  if (database) {
    database.close();
    database = null;
  }
}
