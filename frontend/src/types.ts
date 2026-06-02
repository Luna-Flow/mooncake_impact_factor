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
  momentum_label: z.string()
});

export const dependentItemSchema = z.object({
  full_name: z.string(),
  owner: z.string(),
  package_name: z.string(),
  description: z.string().nullable(),
  latest_version: z.string().nullable(),
  score: z.number(),
  rank_label: z.string(),
  momentum_label: z.string()
});

export const packageVersionSchema = z.object({
  version: z.string(),
  created_at: z.string().nullable(),
  deps: z.unknown()
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
  recent_dependent_count: z.number(),
  download_count: z.number(),
  score: z.number(),
  score_30d_ago: z.number(),
  score_growth_30d: z.number(),
  score_growth_ratio_30d: z.number(),
  rank_label: z.string(),
  momentum_label: z.string(),
  activity_multiplier: z.number(),
  keywords: z.array(z.string()),
  versions: z.array(packageVersionSchema)
});

export const packageSummaryListSchema = z.object({
  items: z.array(packageSummarySchema)
});

export const dependentListSchema = z.object({
  items: z.array(dependentItemSchema)
});

export const packageAnalysisSchema = z.object({
  detail: packageDetailSchema,
  dependents: z.array(dependentItemSchema)
});

export type PackageSummary = z.infer<typeof packageSummarySchema>;
export type DependentItem = z.infer<typeof dependentItemSchema>;
export type PackageVersion = z.infer<typeof packageVersionSchema>;
export type PackageDetail = z.infer<typeof packageDetailSchema>;
export type PackageAnalysis = z.infer<typeof packageAnalysisSchema>;
