import { z } from "zod";

export const packageSummarySchema = z.object({
  full_name: z.string(),
  owner: z.string(),
  package_name: z.string(),
  description: z.string().nullable(),
  latest_version: z.string().nullable(),
  dependent_count: z.number(),
  recent_dependent_count: z.number(),
  download_count: z.number(),
  score: z.number(),
  score_30d_ago: z.number(),
  score_growth_30d: z.number(),
  score_growth_ratio_30d: z.number(),
  rank_label: z.string(),
  rank_position: z.number(),
  momentum_label: z.string(),
  latest_created_at: z.string().nullable(),
  external_dependent_count: z.number(),
  self_dependent_count: z.number(),
  dependent_owner_count: z.number(),
  days_since_release: z.number()
});

export const dependentItemSchema = z.object({
  full_name: z.string(),
  owner: z.string(),
  package_name: z.string(),
  description: z.string().nullable(),
  latest_version: z.string().nullable(),
  score: z.number(),
  rank_label: z.string(),
  rank_position: z.number(),
  momentum_label: z.string(),
  same_owner: z.boolean(),
  first_seen_at: z.string().nullable()
});

/** A dependency of the latest release; registry fields are null for path or git dependencies. */
export const dependencyItemSchema = z.object({
  full_name: z.string(),
  version_req: z.string().nullable(),
  in_registry: z.boolean(),
  description: z.string().nullable(),
  score: z.number().nullable(),
  rank_label: z.string().nullable(),
  rank_position: z.number().nullable()
});

export const packageVersionSchema = z.object({
  version: z.string(),
  created_at: z.string().nullable(),
  yanked: z.boolean(),
  deps: z.unknown()
});

export const scoreBreakdownSchema = z.object({
  dependents: z.number(),
  recent_dependents: z.number(),
  downloads: z.number(),
  multiplier: z.number()
});

export const indexMetaSchema = z.object({
  computed_at: z.string(),
  population: z.number(),
  download_history_used: z.boolean(),
  top_score: z.number(),
  rank_counts: z.record(z.string(), z.number()),
  momentum_counts: z.record(z.string(), z.number())
});

export const packageDetailSchema = z.object({
  full_name: z.string(),
  owner: z.string(),
  package_name: z.string(),
  description: z.string().nullable(),
  repository: z.string().nullable(),
  license: z.string().nullable(),
  latest_version: z.string().nullable(),
  latest_created_at: z.string().nullable(),
  version_count: z.number(),
  dependent_count: z.number(),
  external_dependent_count: z.number(),
  self_dependent_count: z.number(),
  dependent_owner_count: z.number(),
  recent_dependent_count: z.number(),
  download_count: z.number(),
  download_count_30d_ago: z.number().nullable(),
  days_since_release: z.number(),
  score: z.number(),
  score_30d_ago: z.number(),
  score_growth_30d: z.number(),
  score_growth_ratio_30d: z.number(),
  rank_label: z.string(),
  rank_position: z.number(),
  momentum_label: z.string(),
  activity_multiplier: z.number(),
  breakdown: scoreBreakdownSchema,
  keywords: z.array(z.string()),
  versions: z.array(packageVersionSchema)
});

export const packageSummaryListSchema = z.object({
  items: z.array(packageSummarySchema)
});

/** One page of search results; `total` counts the matches before paging. */
export const searchResultSchema = z.object({
  items: z.array(packageSummarySchema),
  total: z.number()
});

export const packageSearchPageSchema = searchResultSchema;

export const staticManifestSchema = z.object({
  schema_version: z.string(),
  generated_at: z.string(),
  package_count: z.number(),
  data_mode: z.literal("static"),
  meta: indexMetaSchema,
  feeds: z.object({
    top: z.number(),
    rising: z.number(),
    new: z.number()
  })
});

export const staticSearchPackageSchema = packageSummarySchema.extend({
  repository: z.string().nullable(),
  license: z.string().nullable(),
  latest_created_at: z.string().nullable(),
  version_count: z.number(),
  activity_multiplier: z.number(),
  keywords: z.array(z.string())
});

export const staticSearchPackageListSchema = z.object({
  items: z.array(staticSearchPackageSchema)
});

export const staticSearchIndexItemSchema = packageSummarySchema.extend({
  latest_created_at: z.string().nullable(),
  external_dependent_count: z.number(),
  dependent_owner_count: z.number(),
  days_since_release: z.number(),
  rank_position: z.number(),
  repository_present: z.boolean(),
  license_present: z.boolean(),
  normalized_full_text: z.string(),
  normalized_owner: z.string(),
  normalized_package: z.string(),
  normalized_description: z.string(),
  normalized_license: z.string(),
  normalized_repository: z.string(),
  normalized_keywords: z.array(z.string())
});

export const staticSearchIndexSchema = z.object({
  items: z.array(staticSearchIndexItemSchema)
});

export const dependentListSchema = z.object({
  items: z.array(dependentItemSchema)
});

export const packageAnalysisSchema = z.object({
  detail: packageDetailSchema,
  dependents: z.array(dependentItemSchema),
  dependencies: z.array(dependencyItemSchema)
});

export type PackageSummary = z.infer<typeof packageSummarySchema>;
export type PackageSearchPage = z.infer<typeof packageSearchPageSchema>;
export type DependentItem = z.infer<typeof dependentItemSchema>;
export type PackageVersion = z.infer<typeof packageVersionSchema>;
export type PackageDetail = z.infer<typeof packageDetailSchema>;
export type DependencyItem = z.infer<typeof dependencyItemSchema>;
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type IndexMeta = z.infer<typeof indexMetaSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type PackageAnalysis = z.infer<typeof packageAnalysisSchema>;
export type StaticManifest = z.infer<typeof staticManifestSchema>;
export type StaticSearchPackage = z.infer<typeof staticSearchPackageSchema>;
export type StaticSearchIndexItem = z.infer<typeof staticSearchIndexItemSchema>;
