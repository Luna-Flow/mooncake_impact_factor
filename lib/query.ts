// TypeScript face of the MoonBit query package (src/query). The semantics
// (parser, serializer, validation, flat parameter derivation) live in
// MoonBit; this module only converts between JSON text and objects.
// Run `npm run build:moonbit` to generate ./moonbit/query/query.js.
import * as moonbit from "./moonbit/query/query.js";

export type QueryGroupOperator = "and" | "or";

export type QueryTermField =
  | "text"
  | "owner"
  | "package"
  | "keyword"
  | "description"
  | "license"
  | "repository"
  | "rank"
  | "momentum"
  | "score"
  | "dependents"
  | "recent_dependents"
  | "external_dependents"
  | "owners"
  | "downloads"
  | "year"
  | "age"
  | "position"
  | "has_repository"
  | "has_license";

export type QueryTermOperator = "match" | "eq" | "gte" | "lte";

export type QueryTermNode = {
  kind: "term";
  field: QueryTermField;
  operator: QueryTermOperator;
  value: string;
  negated?: boolean;
};

export type QueryGroupNode = {
  kind: "group";
  op: QueryGroupOperator;
  children: QueryNode[];
  negated?: boolean;
};

export type QueryNode = QueryGroupNode | QueryTermNode;
export type QueryAst = QueryGroupNode;

/** Flat search parameters of the web interface plus `expr` and `ast`. */
export type LegacySearchParamsShape = {
  q?: string;
  owner?: string;
  packageName?: string;
  keyword?: string;
  description?: string;
  license?: string;
  repository?: string;
  rank?: string;
  momentum?: string;
  minScore?: string;
  maxScore?: string;
  minDependents?: string;
  minRecentDependents?: string;
  minExternalDependents?: string;
  minOwners?: string;
  maxAge?: string;
  minDownloads?: string;
  fromYear?: string;
  toYear?: string;
  hasRepository?: "" | "true" | "false";
  hasLicense?: "" | "true" | "false";
  sort?: string;
  order?: string;
  limit?: string;
  offset?: string;
  expr?: string;
  ast?: string;
};

type Envelope<T> = { ok: T } | { error: string };

/** Unwraps a MoonBit `{"ok":…}` / `{"error":…}` envelope, throwing on error. */
export function unwrapEnvelope<T>(text: string): T {
  const envelope = JSON.parse(text) as Envelope<T>;
  if ("error" in envelope) {
    throw new Error(envelope.error);
  }
  return envelope.ok;
}

function toJson(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

/** The rank labels, best first (`S`, `A`, `B`, `C`, `D`). */
export const RANK_LABELS: readonly string[] = Object.freeze(JSON.parse(moonbit.rank_labels_json()) as string[]);

/** The momentum labels (`New`, `Rising`, `Stable`, `Cooling`). */
export const MOMENTUM_LABELS: readonly string[] = Object.freeze(JSON.parse(moonbit.momentum_labels_json()) as string[]);

export function createEmptyQueryAst(): QueryAst {
  return JSON.parse(moonbit.empty_ast_json()) as QueryAst;
}

export function hasQueryAstIntent(ast: QueryAst | null | undefined): boolean {
  return Boolean(ast) && moonbit.has_intent_json(toJson(ast));
}

/** Validates a JSON value as a query tree; `negated` is kept only when true. */
export function validateQueryAst(input: unknown): QueryAst {
  return unwrapEnvelope<QueryAst>(moonbit.validate_json(toJson(input)));
}

export function serializeQueryAst(ast: QueryAst): string {
  return unwrapEnvelope<string>(moonbit.serialize_json(toJson(ast)));
}

export function parseNativeExpression(input: string): QueryAst {
  return unwrapEnvelope<QueryAst>(moonbit.parse_expression_json(input));
}

export function encodeQueryAst(ast: QueryAst): string {
  return JSON.stringify(validateQueryAst(ast));
}

export function decodeQueryAst(encoded: string): QueryAst {
  return unwrapEnvelope<QueryAst>(moonbit.validate_json(encoded));
}

/** Flat parameters to a query tree; throws for an unknown rank or momentum label. */
export function legacyParamsToAst(params: LegacySearchParamsShape): QueryAst {
  return unwrapEnvelope<QueryAst>(moonbit.derive_ast_json(toJson({ ...params, ast: "", expr: "" })));
}

export function decodeQueryAstFromParams(params: Pick<LegacySearchParamsShape, "ast" | "expr">): QueryAst | null {
  return unwrapEnvelope<QueryAst | null>(
    moonbit.decode_from_params_json(toJson({ ast: params.ast ?? "", expr: params.expr ?? "" }))
  );
}

/** `ast`, else `expr`, else the flat parameters, as a query tree. */
export function deriveQueryAst(params: LegacySearchParamsShape): QueryAst {
  return unwrapEnvelope<QueryAst>(moonbit.derive_ast_json(toJson(params)));
}

export function withQueryAst<T extends LegacySearchParamsShape>(params: T, ast: QueryAst): T {
  return {
    ...params,
    ...unwrapEnvelope<Record<string, string>>(moonbit.with_query_ast_patch_json(toJson(ast)))
  };
}

export function clearStructuredQuery<T extends LegacySearchParamsShape>(params: T): T {
  return {
    ...params,
    ast: "",
    expr: ""
  };
}
