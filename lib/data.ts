import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { DependencyItem, DependentItem, IndexMeta, PackageAnalysis, PackageDetail, PackageSummary, PackageVersion } from "../frontend/src/types";
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


function normalizeSqliteSearchError(error: unknown): never {
  if (error instanceof HttpError) {
    throw error;
  }
  if (error instanceof Error && error.message.includes("fts5:")) {
    throw new HttpError(400, "Invalid full-text search syntax");
  }
  throw error;
}

/** The columns of a PackageSummary, for queries over packages p JOIN package_scores s. */
export const SUMMARY_COLUMNS = `
  p.full_name, p.owner, p.package_name, p.description, p.latest_version, p.latest_created_at,
  p.dependent_count, p.external_dependent_count, p.self_dependent_count, p.dependent_owner_count,
  p.recent_dependent_count, p.download_count, p.days_since_release,
  s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
  s.rank_label, s.rank_position, s.momentum_label`;

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
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
    rank_position: Number(row["rank_position"] ?? 0),
    momentum_label: String(row["momentum_label"] ?? ""),
    latest_created_at: text(row["latest_created_at"]),
    external_dependent_count: Number(row["external_dependent_count"] ?? 0),
    self_dependent_count: Number(row["self_dependent_count"] ?? 0),
    dependent_owner_count: Number(row["dependent_owner_count"] ?? 0),
    days_since_release: Number(row["days_since_release"] ?? 0)
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
    rank_position: Number(row["rank_position"] ?? 0),
    momentum_label: String(row["momentum_label"] ?? ""),
    same_owner: Number(row["same_owner"] ?? 0) === 1,
    first_seen_at: text(row["first_seen_at"])
  };
}

function mapVersion(row: RowRecord): PackageVersion {
  return {
    version: String(row["version"] ?? ""),
    created_at: text(row["created_at"]),
    yanked: Number(row["yanked"] ?? 0) === 1,
    deps: JSON.parse(String(row["deps_json"] ?? "{}"))
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
    external_dependent_count: Number(row["external_dependent_count"] ?? 0),
    self_dependent_count: Number(row["self_dependent_count"] ?? 0),
    dependent_owner_count: Number(row["dependent_owner_count"] ?? 0),
    recent_dependent_count: Number(row["recent_dependent_count"] ?? 0),
    download_count: Number(row["download_count"] ?? 0),
    download_count_30d_ago: row["download_count_30d_ago"] === null || row["download_count_30d_ago"] === undefined ? null : Number(row["download_count_30d_ago"]),
    days_since_release: Number(row["days_since_release"] ?? 0),
    score: Number(row["score"] ?? 0),
    score_30d_ago: Number(row["score_30d_ago"] ?? 0),
    score_growth_30d: Number(row["score_growth_30d"] ?? 0),
    score_growth_ratio_30d: Number(row["score_growth_ratio_30d"] ?? 0),
    rank_label: String(row["rank_label"] ?? ""),
    rank_position: Number(row["rank_position"] ?? 0),
    momentum_label: String(row["momentum_label"] ?? ""),
    activity_multiplier: Number(row["activity_multiplier"] ?? 0),
    breakdown: {
      dependents: Number(row["part_dependents"] ?? 0),
      recent_dependents: Number(row["part_recent_dependents"] ?? 0),
      downloads: Number(row["part_downloads"] ?? 0),
      multiplier: Number(row["activity_multiplier"] ?? 0)
    },
    keywords: JSON.parse(String(row["keywords_json"] ?? "[]")),
    versions: []
  };
}

export function getFeedPackages(source: FeedSource, limit = 40): PackageSummary[] {
  const clampedLimit = clampLimit(limit, 200, 40);
  const db = getDatabase();
  let sql = `SELECT ${SUMMARY_COLUMNS} FROM packages p JOIN package_scores s ON s.package_id = p.id `;
  const params: Array<string | number> = [];
  if (source === "rising") {
    sql += "WHERE s.momentum_label = 'Rising' ORDER BY s.score_growth_30d DESC, s.score DESC, p.full_name ASC LIMIT ?";
  } else if (source === "new") {
    sql += "WHERE s.momentum_label = 'New' ORDER BY s.score DESC, p.full_name ASC LIMIT ?";
  } else {
    sql += "ORDER BY s.rank_position ASC, p.full_name ASC LIMIT ?";
  }
  params.push(clampedLimit);
  return (db.prepare(sql).all(...params) as RowRecord[]).map(mapPackageSummary);
}

/** When the index was computed, how many packages it ranks, and whether download history was used. */
export function getIndexMeta(): IndexMeta {
  const rows = getDatabase().prepare("SELECT key, value FROM index_meta").all() as RowRecord[];
  const meta = new Map(rows.map((row) => [String(row["key"]), String(row["value"])]));
  return {
    computed_at: meta.get("computed_at") ?? "",
    population: Number(meta.get("population") ?? 0),
    download_history_used: meta.get("download_history_used") === "true",
    top_score: Number(meta.get("top_score") ?? 0),
    rank_counts: JSON.parse(meta.get("rank_counts") ?? "{}"),
    momentum_counts: JSON.parse(meta.get("momentum_counts") ?? "{}")
  };
}


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

export function getPackageAnalysis(fullName: string): PackageAnalysis {
  const db = getDatabase();
  const detailRow = db.prepare(`
    SELECT
      p.id, p.repository, p.license, p.version_count, p.keywords_json, p.download_count_30d_ago,
      s.activity_multiplier, s.part_dependents, s.part_recent_dependents, s.part_downloads,
      ${SUMMARY_COLUMNS}
    FROM packages p
    JOIN package_scores s ON s.package_id = p.id
    WHERE p.full_name = ?
  `).get(fullName) as RowRecord | undefined;

  if (!detailRow) {
    throw new HttpError(404, "Package not found");
  }

  const detail = mapPackageDetail(detailRow);
  const packageId = Number(detailRow["id"]);

  detail.versions = (db.prepare(`
    SELECT version, created_at, yanked, deps_json
    FROM versions
    WHERE package_id = ?
    ORDER BY position ASC
  `).all(packageId) as RowRecord[]).map(mapVersion);

  const dependents = (db.prepare(`
    SELECT
      p.full_name, p.owner, p.package_name, p.description, p.latest_version,
      s.score, s.rank_label, s.rank_position, s.momentum_label,
      e.same_owner, e.first_seen_at
    FROM package_edges e
    JOIN packages p ON p.id = e.source_package_id
    JOIN package_scores s ON s.package_id = p.id
    WHERE e.target_package_id = ?
    ORDER BY e.same_owner ASC, s.rank_position ASC, p.full_name ASC
  `).all(packageId) as RowRecord[]).map(mapDependentItem);

  const latest = detail.versions.find((version) => version.version === detail.latest_version);
  const declared = latest && latest.deps && typeof latest.deps === "object" ? Object.entries(latest.deps as Record<string, unknown>) : [];
  const lookup = db.prepare(`
    SELECT p.description, s.score, s.rank_label, s.rank_position
    FROM packages p JOIN package_scores s ON s.package_id = p.id
    WHERE p.full_name = ?
  `);
  const dependencies: DependencyItem[] = declared
    .map(([name, requirement]) => {
      const row = lookup.get(name) as RowRecord | undefined;
      return {
        full_name: name,
        version_req: typeof requirement === "string" ? requirement : null,
        in_registry: Boolean(row),
        description: row ? text(row["description"]) : null,
        score: row ? Number(row["score"]) : null,
        rank_label: row ? String(row["rank_label"]) : null,
        rank_position: row ? Number(row["rank_position"]) : null
      };
    })
    .sort((a, b) => (a.rank_position ?? Infinity) - (b.rank_position ?? Infinity) || a.full_name.localeCompare(b.full_name));

  return { detail, dependents, dependencies };
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
