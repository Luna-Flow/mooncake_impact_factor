// Packages shared by the database tests and the static search tests, with
// ties on purpose: growth (alice, carol), downloads (bob, carol), dependents
// (carol, dave), external dependents (alice, carol), age (bob, carol) and
// score (dave, erin), so that every sort key exercises the tie-break.
export const searchPackages = [
  {
    id: 1, full_name: "alice/toolkit", description: "alpha toolkit package", keywords: ["alpha", "tooling"],
    repository: "https://example.com/toolkit", license: "MIT", latest_version: "1.10.0", latest_created_at: null,
    score: 210, score_30d_ago: 120, score_growth_30d: 90, score_growth_ratio_30d: 0.75, rank_label: "A",
    momentum_label: "Rising", download_count: 1200, dependent_count: 9, recent_dependent_count: 4,
    external_dependent_count: 1, dependent_owner_count: 1, days_since_release: 400, rank_position: 1
  },
  {
    id: 2, full_name: "bob/helper", description: "helper package", keywords: ["helper"],
    repository: null, license: "Apache-2.0", latest_version: "0.4.0", latest_created_at: "2026-01-01T00:00:00+00:00",
    score: 80, score_30d_ago: 75, score_growth_30d: 5, score_growth_ratio_30d: 0.066, rank_label: "C",
    momentum_label: "New", download_count: 100, dependent_count: 0, recent_dependent_count: 0,
    external_dependent_count: 0, dependent_owner_count: 0, days_since_release: 20, rank_position: 5
  },
  {
    id: 3, full_name: "carol/csv", description: "csv reader", keywords: ["csv"],
    repository: "https://example.com/csv", license: null, latest_version: "2.0.0", latest_created_at: "2025-03-01T00:00:00+00:00",
    score: 150, score_30d_ago: 60, score_growth_30d: 90, score_growth_ratio_30d: 1.5, rank_label: "B",
    momentum_label: "Stable", download_count: 100, dependent_count: 3, recent_dependent_count: 1,
    external_dependent_count: 1, dependent_owner_count: 2, days_since_release: 20, rank_position: 2
  },
  {
    id: 4, full_name: "dave/yaml", description: "yaml parser", keywords: ["yaml"],
    repository: null, license: "MIT", latest_version: "0.1.0", latest_created_at: "2024-07-01T00:00:00+00:00",
    score: 120, score_30d_ago: 110, score_growth_30d: 10, score_growth_ratio_30d: 0.09, rank_label: "B",
    momentum_label: "Cooling", download_count: 500, dependent_count: 3, recent_dependent_count: 1,
    external_dependent_count: 0, dependent_owner_count: 0, days_since_release: 90, rank_position: 3
  },
  {
    id: 5, full_name: "erin/zip", description: "zip archive", keywords: [],
    repository: null, license: null, latest_version: "0.0.1", latest_created_at: "2023-01-01T00:00:00+00:00",
    score: 120, score_30d_ago: 120, score_growth_30d: 0, score_growth_ratio_30d: 0, rank_label: "B",
    momentum_label: "Stable", download_count: 0, dependent_count: 0, recent_dependent_count: 0,
    external_dependent_count: 0, dependent_owner_count: 0, days_since_release: 1000, rank_position: 4
  }
];

export function ownerOf(pkg) {
  return pkg.full_name.split("/")[0];
}

export function nameOf(pkg) {
  return pkg.full_name.split("/")[1];
}

/** The package as a record of the static search index. */
export function toIndexItem(pkg) {
  const owner = ownerOf(pkg);
  const packageName = nameOf(pkg);
  const lower = (text) => (text ?? "").trim().toLowerCase();
  return {
    full_name: pkg.full_name,
    owner,
    package_name: packageName,
    description: pkg.description,
    latest_version: pkg.latest_version,
    latest_created_at: pkg.latest_created_at,
    dependent_count: pkg.dependent_count,
    recent_dependent_count: pkg.recent_dependent_count,
    external_dependent_count: pkg.external_dependent_count,
    dependent_owner_count: pkg.dependent_owner_count,
    days_since_release: pkg.days_since_release,
    rank_position: pkg.rank_position,
    download_count: pkg.download_count,
    score: pkg.score,
    score_30d_ago: pkg.score_30d_ago,
    score_growth_30d: pkg.score_growth_30d,
    score_growth_ratio_30d: pkg.score_growth_ratio_30d,
    rank_label: pkg.rank_label,
    momentum_label: pkg.momentum_label,
    repository_present: Boolean(pkg.repository),
    license_present: Boolean(pkg.license),
    normalized_full_text: [pkg.full_name, owner, packageName, pkg.description, ...pkg.keywords].map(lower).join(" "),
    normalized_owner: owner,
    normalized_package: packageName,
    normalized_description: lower(pkg.description),
    normalized_license: lower(pkg.license),
    normalized_repository: lower(pkg.repository),
    normalized_keywords: pkg.keywords.map(lower)
  };
}

export const SORT_KEYS = [
  "relevance", "score", "growth", "downloads", "dependents", "recent", "updated",
  "name", "external", "owners", "position", "age"
];

const ASCENDING_BY_DEFAULT = new Set(["relevance", "name", "position", "age"]);

function year(pkg) {
  return pkg.latest_created_at ? Number(pkg.latest_created_at.slice(0, 4)) : 0;
}

const KEY = {
  score: (pkg) => pkg.score,
  growth: (pkg) => pkg.score_growth_30d,
  downloads: (pkg) => pkg.download_count,
  dependents: (pkg) => pkg.dependent_count,
  recent: (pkg) => pkg.recent_dependent_count,
  updated: year,
  external: (pkg) => pkg.external_dependent_count,
  owners: (pkg) => pkg.dependent_owner_count,
  age: (pkg) => pkg.days_since_release
};

/**
 * The order the specification asks for, independent of the implementation:
 * the key in the requested direction (default ascending for relevance,
 * name, position and age), ties by rank position, then by name. Relevance
 * without a text query is the rank position, and ignores `order`.
 */
export function expectedOrder(packages, sort, order) {
  const ascending = order ? order === "asc" : ASCENDING_BY_DEFAULT.has(sort);
  const factor = ascending ? 1 : -1;
  const byName = (a, b) => (a.full_name < b.full_name ? -1 : a.full_name > b.full_name ? 1 : 0);
  const tie = (a, b) => a.rank_position - b.rank_position || byName(a, b);
  return [...packages]
    .sort((a, b) => {
      if (sort === "relevance") return tie(a, b);
      if (sort === "name") return factor * byName(a, b);
      if (sort === "position") return factor * (a.rank_position - b.rank_position) || byName(a, b);
      return factor * (KEY[sort](a) - KEY[sort](b)) || tie(a, b);
    })
    .map((pkg) => pkg.full_name);
}
