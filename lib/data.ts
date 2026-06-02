import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { DependentItem, PackageDetail, PackageSummary, PackageVersion } from "../frontend/src/types";
import type { FeedSource } from "../frontend/src/api";

type SearchInput = {
  q?: string | null;
  limit?: string | number | null;
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
  min_downloads?: string | number | null;
  from_year?: string | number | null;
  to_year?: string | number | null;
  has_repository?: string | null;
  has_license?: string | null;
  sort?: string | null;
  order?: string | null;
};

type ParsedSearchParams = {
  q: string;
  limit: number;
  owner: string;
  packageName: string;
  keyword: string;
  description: string;
  license: string;
  repository: string;
  rank: string;
  momentum: string;
  minScore: number | null;
  maxScore: number | null;
  minDependents: number | null;
  minRecentDependents: number | null;
  minDownloads: number | null;
  fromYear: number | null;
  toYear: number | null;
  hasRepository: boolean | null;
  hasLicense: boolean | null;
  sort: string;
  order: string;
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

function parseNumeric(value: string | number | null | undefined, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${label} must be a valid number`);
  }
  return parsed;
}

function parseInteger(value: string | number | null | undefined, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, `${label} must be an integer`);
  }
  return parsed;
}

function parseBoolean(value: string | null | undefined, label: string): boolean | null {
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new HttpError(400, `${label} must be either true or false`);
}

function normalizeRankLabel(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (["S", "A", "B", "C", "D"].includes(normalized)) return normalized;
  throw new HttpError(400, "rank must be one of S, A, B, C, D");
}

function normalizeMomentumLabel(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "rising") return "Rising";
  if (normalized === "hot") return "Hot";
  if (normalized === "stable") return "Stable";
  throw new HttpError(400, "momentum must be one of Rising, Hot, Stable");
}

function parseSearchParams(input: SearchInput): ParsedSearchParams {
  const params: ParsedSearchParams = {
    q: input.q?.trim() ?? "",
    limit: clampLimit(input.limit, 100, 20),
    owner: input.owner?.trim() ?? "",
    packageName: input.package?.trim() ?? "",
    keyword: input.keyword?.trim() ?? "",
    description: input.description?.trim() ?? "",
    license: input.license?.trim() ?? "",
    repository: input.repository?.trim() ?? "",
    rank: input.rank?.trim() ?? "",
    momentum: input.momentum?.trim() ?? "",
    minScore: parseNumeric(input.min_score, "min_score"),
    maxScore: parseNumeric(input.max_score, "max_score"),
    minDependents: parseInteger(input.min_dependents, "min_dependents"),
    minRecentDependents: parseInteger(input.min_recent_dependents, "min_recent_dependents"),
    minDownloads: parseInteger(input.min_downloads, "min_downloads"),
    fromYear: parseInteger(input.from_year, "from_year"),
    toYear: parseInteger(input.to_year, "to_year"),
    hasRepository: parseBoolean(input.has_repository ?? undefined, "has_repository"),
    hasLicense: parseBoolean(input.has_license ?? undefined, "has_license"),
    sort: input.sort?.trim() ?? "",
    order: input.order?.trim() ?? ""
  };

  validateSearchParams(params);
  return params;
}

function validateSearchParams(params: ParsedSearchParams): void {
  if (params.minScore !== null && params.minScore < 0) {
    throw new HttpError(400, "min_score must be greater than or equal to 0");
  }
  if (params.maxScore !== null && params.maxScore < 0) {
    throw new HttpError(400, "max_score must be greater than or equal to 0");
  }
  if (params.minScore !== null && params.maxScore !== null && params.minScore > params.maxScore) {
    throw new HttpError(400, "min_score cannot be greater than max_score");
  }
  for (const [label, value] of [
    ["min_dependents", params.minDependents],
    ["min_recent_dependents", params.minRecentDependents],
    ["min_downloads", params.minDownloads]
  ] as const) {
    if (value !== null && value < 0) {
      throw new HttpError(400, `${label} must be greater than or equal to 0`);
    }
  }
  for (const [label, value] of [["from_year", params.fromYear], ["to_year", params.toYear]] as const) {
    if (value !== null && (value < 1970 || value > 9999)) {
      throw new HttpError(400, `${label} must be between 1970 and 9999`);
    }
  }
  if (params.fromYear !== null && params.toYear !== null && params.fromYear > params.toYear) {
    throw new HttpError(400, "from_year cannot be greater than to_year");
  }
  normalizeRankLabel(params.rank);
  normalizeMomentumLabel(params.momentum);
  resolveOrderBy(params.sort, params.order, hasAnyTextFilters(params));
}

function hasAnyTextFilters(params: ParsedSearchParams): boolean {
  return Boolean(
    params.q ||
      params.owner ||
      params.packageName ||
      params.keyword ||
      params.description
  );
}

function hasNonTextFilters(params: ParsedSearchParams): boolean {
  return Boolean(
    params.license ||
      params.repository ||
      params.rank ||
      params.momentum ||
      params.minScore !== null ||
      params.maxScore !== null ||
      params.minDependents !== null ||
      params.minRecentDependents !== null ||
      params.minDownloads !== null ||
      params.fromYear !== null ||
      params.toYear !== null ||
      params.hasRepository !== null ||
      params.hasLicense !== null
  );
}

function tokenizeQuery(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of input) {
    if (char === "\"") {
      current += char;
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) {
      current += char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (char === "(" || char === ")") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push(char);
      continue;
    }
    current += char;
  }

  if (inQuotes) {
    throw new HttpError(400, "Unclosed quoted phrase in search query");
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function isBooleanOperator(token: string): boolean {
  const normalized = token.toUpperCase();
  return normalized === "AND" || normalized === "OR" || normalized === "NOT";
}

function normalizeFtsText(input: string): string {
  return input
    .split("")
    .map((char) => {
      if ("/:+,;()[]{}\"".includes(char)) return " ";
      if (/[A-Za-z0-9_.\-*#]/.test(char)) return char;
      if (/\s/.test(char)) return " ";
      return " ";
    })
    .join("")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function compileFtsValue(token: string): string {
  if (token.startsWith("\"")) {
    if (!token.endsWith("\"") || token.length < 2) {
      throw new HttpError(400, "Unclosed quoted phrase in search query");
    }
    const inner = normalizeFtsText(token.slice(1, -1).trim());
    if (!inner) {
      throw new HttpError(400, "Empty quoted phrase in search query");
    }
    return `"${inner}"`;
  }

  const normalized = normalizeFtsText(token);
  if (!normalized) {
    throw new HttpError(400, `Unsupported search token \`${token}\``);
  }
  if (normalized.includes(" ")) {
    return `"${normalized}"`;
  }
  if (normalized.endsWith("*")) {
    return normalized;
  }
  return `${normalized}*`;
}

function splitFieldToken(token: string): [string, string] | null {
  const index = token.indexOf(":");
  if (index <= 0 || index === token.length - 1) return null;
  const field = token.slice(0, index);
  const value = token.slice(index + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(field)) return null;
  return [field, value];
}

function mapFieldAlias(field: string): string | null {
  const normalized = field.toLowerCase();
  if (["name", "full_name"].includes(normalized)) return "full_name";
  if (["owner", "author"].includes(normalized)) return "owner";
  if (["package", "pkg", "package_name"].includes(normalized)) return "package_name";
  if (["keyword", "keywords", "tag", "tags"].includes(normalized)) return "keywords";
  if (["description", "desc", "abstract"].includes(normalized)) return "description";
  return null;
}

function compileGlobalToken(token: string): string {
  const split = splitFieldToken(token);
  if (!split) return compileFtsValue(token);
  const [field, rawValue] = split;
  const mapped = mapFieldAlias(field);
  if (!mapped) {
    throw new HttpError(400, `Unsupported search field \`${field}\`. Use owner, package, keyword, description, or name`);
  }
  return `${mapped} : ${compileFtsValue(rawValue)}`;
}

function compileFtsExpression(input: string): string {
  const compiled = tokenizeQuery(input).map((token) => {
    if (isBooleanOperator(token) || token === "(" || token === ")") {
      return token.toUpperCase();
    }
    return compileGlobalToken(token);
  });
  if (compiled.length === 0) {
    throw new HttpError(400, "Search query is empty");
  }
  return compiled.join(" ");
}

function compileFieldExpression(field: string, input: string): string {
  const compiled = tokenizeQuery(input).map((token) => {
    if (isBooleanOperator(token) || token === "(" || token === ")") {
      return token.toUpperCase();
    }
    return `${field} : ${compileFtsValue(token)}`;
  });
  if (compiled.length === 0) {
    throw new HttpError(400, `Search field \`${field}\` is empty`);
  }
  return compiled.join(" ");
}

function buildFtsQuery(params: ParsedSearchParams): string | null {
  const clauses: string[] = [];
  if (params.q) clauses.push(compileFtsExpression(params.q));
  if (params.owner) clauses.push(compileFieldExpression("owner", params.owner));
  if (params.packageName) clauses.push(compileFieldExpression("package_name", params.packageName));
  if (params.keyword) clauses.push(compileFieldExpression("keywords", params.keyword));
  if (params.description) clauses.push(compileFieldExpression("description", params.description));
  return clauses.length > 0 ? clauses.join(" AND ") : null;
}

function resolveOrderBy(sort: string, order: string, hasFtsQuery: boolean): string {
  const normalizedSort = (sort.trim() || (hasFtsQuery ? "relevance" : "score")).toLowerCase();
  const defaultOrder = normalizedSort === "relevance" || normalizedSort === "name" ? "asc" : "desc";
  const normalizedOrder = (order.trim() || defaultOrder).toLowerCase();
  if (normalizedOrder !== "asc" && normalizedOrder !== "desc") {
    throw new HttpError(400, "order must be either asc or desc");
  }

  switch (normalizedSort) {
    case "relevance":
      return hasFtsQuery
        ? "bm25(search_index) ASC, s.score DESC, p.full_name ASC"
        : "s.score DESC, p.full_name ASC";
    case "score":
      return `s.score ${normalizedOrder.toUpperCase()}, p.full_name ASC`;
    case "growth":
      return `s.score_growth_30d ${normalizedOrder.toUpperCase()}, s.score DESC, p.full_name ASC`;
    case "downloads":
      return `p.download_count ${normalizedOrder.toUpperCase()}, s.score DESC, p.full_name ASC`;
    case "dependents":
      return `p.dependent_count ${normalizedOrder.toUpperCase()}, s.score DESC, p.full_name ASC`;
    case "recent":
      return `p.recent_dependent_count ${normalizedOrder.toUpperCase()}, s.score DESC, p.full_name ASC`;
    case "updated":
      return `COALESCE(p.latest_created_at, '') ${normalizedOrder.toUpperCase()}, p.full_name ASC`;
    case "name":
      return `p.full_name ${normalizedOrder.toUpperCase()}`;
    default:
      throw new HttpError(400, "sort must be one of relevance, score, growth, downloads, dependents, recent, updated, name");
  }
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

export function searchPackagesFromInput(input: SearchInput): PackageSummary[] {
  const params = parseSearchParams(input);
  const ftsQuery = buildFtsQuery(params);
  if (!ftsQuery && !hasNonTextFilters(params)) {
    return getFeedPackages("top", params.limit);
  }

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
  if (ftsQuery) {
    sql += "JOIN search_index si ON si.rowid = p.id\n";
  }
  sql += "WHERE 1 = 1\n";

  const values: Array<string | number> = [];
  if (ftsQuery) {
    sql += "  AND search_index MATCH ?\n";
    values.push(ftsQuery);
  }
  if (params.license) {
    sql += "  AND LOWER(COALESCE(p.license, '')) LIKE LOWER(?)\n";
    values.push(`%${params.license}%`);
  }
  if (params.repository) {
    sql += "  AND LOWER(COALESCE(p.repository, '')) LIKE LOWER(?)\n";
    values.push(`%${params.repository}%`);
  }
  const rankLabel = normalizeRankLabel(params.rank);
  if (rankLabel) {
    sql += "  AND s.rank_label = ?\n";
    values.push(rankLabel);
  }
  const momentumLabel = normalizeMomentumLabel(params.momentum);
  if (momentumLabel) {
    sql += "  AND s.momentum_label = ?\n";
    values.push(momentumLabel);
  }
  if (params.minScore !== null) {
    sql += "  AND s.score >= ?\n";
    values.push(params.minScore);
  }
  if (params.maxScore !== null) {
    sql += "  AND s.score <= ?\n";
    values.push(params.maxScore);
  }
  if (params.minDependents !== null) {
    sql += "  AND p.dependent_count >= ?\n";
    values.push(params.minDependents);
  }
  if (params.minRecentDependents !== null) {
    sql += "  AND p.recent_dependent_count >= ?\n";
    values.push(params.minRecentDependents);
  }
  if (params.minDownloads !== null) {
    sql += "  AND p.download_count >= ?\n";
    values.push(params.minDownloads);
  }
  if (params.fromYear !== null) {
    sql += "  AND CAST(substr(COALESCE(p.latest_created_at, ''), 1, 4) AS INTEGER) >= ?\n";
    values.push(params.fromYear);
  }
  if (params.toYear !== null) {
    sql += "  AND CAST(substr(COALESCE(p.latest_created_at, ''), 1, 4) AS INTEGER) <= ?\n";
    values.push(params.toYear);
  }
  if (params.hasRepository !== null) {
    sql += params.hasRepository
      ? "  AND p.repository IS NOT NULL AND trim(p.repository) <> ''\n"
      : "  AND (p.repository IS NULL OR trim(p.repository) = '')\n";
  }
  if (params.hasLicense !== null) {
    sql += params.hasLicense
      ? "  AND p.license IS NOT NULL AND trim(p.license) <> ''\n"
      : "  AND (p.license IS NULL OR trim(p.license) = '')\n";
  }

  sql += `ORDER BY ${resolveOrderBy(params.sort, params.order, Boolean(ftsQuery))}\nLIMIT ?`;
  values.push(params.limit);

  return (getDatabase().prepare(sql).all(...values) as RowRecord[]).map(mapPackageSummary);
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

  detail.versions = (db.prepare(`
    SELECT version, created_at, deps_json
    FROM versions
    WHERE package_id = ?
    ORDER BY created_at DESC, version DESC
    LIMIT 20
  `).all(packageId) as RowRecord[]).map(mapVersion);

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
