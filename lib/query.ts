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
  | "downloads"
  | "year"
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

type LegacySearchParamsShape = {
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
  minDownloads?: string;
  fromYear?: string;
  toYear?: string;
  hasRepository?: "" | "true" | "false";
  hasLicense?: "" | "true" | "false";
  sort?: string;
  order?: string;
  expr?: string;
  ast?: string;
};

const FIELD_SET = new Set<QueryTermField>([
  "text",
  "owner",
  "package",
  "keyword",
  "description",
  "license",
  "repository",
  "rank",
  "momentum",
  "score",
  "dependents",
  "recent_dependents",
  "downloads",
  "year",
  "has_repository",
  "has_license"
]);

const OPERATOR_SET = new Set<QueryTermOperator>(["match", "eq", "gte", "lte"]);

export function createEmptyQueryAst(): QueryAst {
  return { kind: "group", op: "and", children: [] };
}

export function hasQueryAstIntent(ast: QueryAst | null | undefined): boolean {
  return Boolean(ast && ast.children.some(hasNodeIntent));
}

function hasNodeIntent(node: QueryNode): boolean {
  if (node.kind === "term") {
    return node.value.trim().length > 0;
  }
  return node.children.some(hasNodeIntent);
}

function isGroupOperator(value: string): value is QueryGroupOperator {
  return value === "and" || value === "or";
}

function isTermField(value: string): value is QueryTermField {
  return FIELD_SET.has(value as QueryTermField);
}

function isTermOperator(value: string): value is QueryTermOperator {
  return OPERATOR_SET.has(value as QueryTermOperator);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateQueryAst(input: unknown): QueryAst {
  if (!isRecord(input)) {
    throw new Error("Query AST must be an object");
  }
  if (input["kind"] !== "group") {
    throw new Error("Query AST root must be a group");
  }
  return validateGroupNode(input);
}

function validateGroupNode(input: Record<string, unknown>): QueryGroupNode {
  if (input["kind"] !== "group") {
    throw new Error("Expected query group node");
  }
  if (!isGroupOperator(String(input["op"] ?? ""))) {
    throw new Error("Query group operator must be and or or");
  }
  const childrenInput = input["children"];
  if (!Array.isArray(childrenInput)) {
    throw new Error("Query group children must be an array");
  }
  return {
    kind: "group",
    op: String(input["op"]) as QueryGroupOperator,
    negated: input["negated"] === true,
    children: childrenInput.map(validateQueryNode)
  };
}

function validateTermNode(input: Record<string, unknown>): QueryTermNode {
  if (input["kind"] !== "term") {
    throw new Error("Expected query term node");
  }
  const field = String(input["field"] ?? "");
  const operator = String(input["operator"] ?? "");
  const value = input["value"];
  if (!isTermField(field)) {
    throw new Error(`Unsupported query field \`${field}\``);
  }
  if (!isTermOperator(operator)) {
    throw new Error(`Unsupported query operator \`${operator}\``);
  }
  if (typeof value !== "string") {
    throw new Error("Query term value must be a string");
  }
  return {
    kind: "term",
    field,
    operator,
    value,
    negated: input["negated"] === true
  };
}

function validateQueryNode(input: unknown): QueryNode {
  if (!isRecord(input)) {
    throw new Error("Query node must be an object");
  }
  if (input["kind"] === "group") {
    return validateGroupNode(input);
  }
  if (input["kind"] === "term") {
    return validateTermNode(input);
  }
  throw new Error("Unknown query node kind");
}

function encodeQuotedValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "\"\"";
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(trimmed)) {
    return trimmed;
  }
  return `"${trimmed.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function serializeTermNode(term: QueryTermNode): string {
  const value = encodeQuotedValue(term.value);
  if (term.operator === "match") {
    return term.field === "text" ? value : `${term.field}:${value}`;
  }
  if (term.operator === "eq") {
    return `${term.field}=${value}`;
  }
  if (term.operator === "gte") {
    return `${term.field}>=${value}`;
  }
  return `${term.field}<=${value}`;
}

function serializeNode(node: QueryNode, parentOp: QueryGroupOperator | null): string {
  if (node.kind === "term") {
    const inner = serializeTermNode(node);
    return node.negated ? `NOT ${inner}` : inner;
  }

  const body = node.children.map((child) => serializeNode(child, node.op)).join(` ${node.op.toUpperCase()} `);
  const wrapped = parentOp && parentOp !== node.op && node.children.length > 1 ? `(${body})` : body || "()";
  return node.negated ? `NOT ${wrapped}` : wrapped;
}

export function serializeQueryAst(ast: QueryAst): string {
  return serializeNode(ast, null);
}

type Token =
  | { type: "lparen" | "rparen" | "and" | "or" | "not" }
  | { type: "text"; value: string }
  | { type: "operator"; value: ":" | "=" | ">=" | "<=" }
  | { type: "identifier"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (!char) break;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }
    if (char === ":" || char === "=") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if ((char === ">" || char === "<") && input[index + 1] === "=") {
      tokens.push({ type: "operator", value: `${char}=` as ">=" | "<=" });
      index += 2;
      continue;
    }
    if (char === "\"") {
      let value = "";
      index += 1;
      while (index < input.length) {
        const inner = input[index];
        if (inner === "\\") {
          const next = input[index + 1];
          if (!next) {
            throw new Error("Unclosed quoted string");
          }
          value += next;
          index += 2;
          continue;
        }
        if (inner === "\"") {
          index += 1;
          break;
        }
        value += inner;
        index += 1;
      }
      if (index > input.length) {
        throw new Error("Unclosed quoted string");
      }
      tokens.push({ type: "text", value });
      continue;
    }

    let value = "";
    while (index < input.length) {
      const inner = input[index];
      if (!inner || /\s/.test(inner) || inner === "(" || inner === ")" || inner === ":" || inner === "=") {
        break;
      }
      if ((inner === ">" || inner === "<") && input[index + 1] === "=") {
        break;
      }
      value += inner;
      index += 1;
    }

    const upper = value.toUpperCase();
    if (upper === "AND") {
      tokens.push({ type: "and" });
    } else if (upper === "OR") {
      tokens.push({ type: "or" });
    } else if (upper === "NOT") {
      tokens.push({ type: "not" });
    } else {
      tokens.push({ type: "identifier", value });
    }
  }

  return tokens;
}

class TokenCursor {
  private index = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(): Token | null {
    return this.tokens[this.index] ?? null;
  }

  consume(): Token | null {
    const token = this.tokens[this.index] ?? null;
    if (token) this.index += 1;
    return token;
  }

  expect(type: Token["type"]): Token {
    const token = this.consume();
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type}`);
    }
    return token;
  }

  done(): boolean {
    return this.index >= this.tokens.length;
  }
}

function parseValue(cursor: TokenCursor): string {
  const token = cursor.consume();
  if (!token) {
    throw new Error("Missing query value");
  }
  if (token.type === "identifier" || token.type === "text") {
    return token.value;
  }
  throw new Error("Invalid query value");
}

function coalesceGroup(op: QueryGroupOperator, nodes: QueryNode[]): QueryNode {
  if (nodes.length === 1) {
    return nodes[0] ?? createEmptyQueryAst();
  }
  return { kind: "group", op, children: nodes };
}

function parsePrimary(cursor: TokenCursor): QueryNode {
  const token = cursor.peek();
  if (!token) {
    throw new Error("Unexpected end of query expression");
  }
  if (token.type === "lparen") {
    cursor.consume();
    const inner = parseOr(cursor);
    cursor.expect("rparen");
    return inner;
  }
  if (token.type === "not") {
    cursor.consume();
    const inner = parsePrimary(cursor);
    return inner.kind === "term" ? { ...inner, negated: !inner.negated } : { ...inner, negated: !inner.negated };
  }

  const first = cursor.consume();
  if (!first) {
    throw new Error("Unexpected end of query expression");
  }
  if (first.type === "identifier") {
    const maybeOperator = cursor.peek();
    if (maybeOperator?.type === "operator") {
      cursor.consume();
      const field = first.value;
      if (!isTermField(field)) {
        throw new Error(`Unsupported query field \`${field}\``);
      }
      const rawValue = parseValue(cursor);
      const operator =
        maybeOperator.value === ":"
          ? "match"
          : maybeOperator.value === "="
            ? "eq"
            : maybeOperator.value === ">="
              ? "gte"
              : "lte";
      return {
        kind: "term",
        field,
        operator,
        value: rawValue
      };
    }

    return {
      kind: "term",
      field: "text",
      operator: "match",
      value: first.value
    };
  }
  if (first.type === "text") {
    return {
      kind: "term",
      field: "text",
      operator: "match",
      value: first.value
    };
  }

  throw new Error("Invalid query term");
}

function parseAnd(cursor: TokenCursor): QueryNode {
  const nodes: QueryNode[] = [parsePrimary(cursor)];
  while (cursor.peek()?.type === "and") {
    cursor.consume();
    nodes.push(parsePrimary(cursor));
  }
  return coalesceGroup("and", nodes);
}

function parseOr(cursor: TokenCursor): QueryNode {
  const nodes: QueryNode[] = [parseAnd(cursor)];
  while (cursor.peek()?.type === "or") {
    cursor.consume();
    nodes.push(parseAnd(cursor));
  }
  return coalesceGroup("or", nodes);
}

export function parseNativeExpression(input: string): QueryAst {
  const trimmed = input.trim();
  if (!trimmed) {
    return createEmptyQueryAst();
  }

  const cursor = new TokenCursor(tokenize(trimmed));
  const root = parseOr(cursor);
  if (!cursor.done()) {
    throw new Error("Unexpected trailing query tokens");
  }
  return root.kind === "group" ? root : { kind: "group", op: "and", children: [root] };
}

export function encodeQueryAst(ast: QueryAst): string {
  return JSON.stringify(ast);
}

export function decodeQueryAst(encoded: string): QueryAst {
  return validateQueryAst(JSON.parse(encoded));
}

function addLegacyTerm(target: QueryNode[], field: QueryTermField, operator: QueryTermOperator, value: string | undefined): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return;
  target.push({ kind: "term", field, operator, value: trimmed });
}

export function legacyParamsToAst(params: LegacySearchParamsShape): QueryAst {
  const children: QueryNode[] = [];
  addLegacyTerm(children, "text", "match", params.q);
  addLegacyTerm(children, "owner", "match", params.owner);
  addLegacyTerm(children, "package", "match", params.packageName);
  addLegacyTerm(children, "keyword", "match", params.keyword);
  addLegacyTerm(children, "description", "match", params.description);
  addLegacyTerm(children, "license", "match", params.license);
  addLegacyTerm(children, "repository", "match", params.repository);
  addLegacyTerm(children, "rank", "eq", params.rank);
  addLegacyTerm(children, "momentum", "eq", params.momentum);
  addLegacyTerm(children, "score", "gte", params.minScore);
  addLegacyTerm(children, "score", "lte", params.maxScore);
  addLegacyTerm(children, "dependents", "gte", params.minDependents);
  addLegacyTerm(children, "recent_dependents", "gte", params.minRecentDependents);
  addLegacyTerm(children, "downloads", "gte", params.minDownloads);
  addLegacyTerm(children, "year", "gte", params.fromYear);
  addLegacyTerm(children, "year", "lte", params.toYear);
  if (params.hasRepository) {
    children.push({
      kind: "term",
      field: "has_repository",
      operator: "eq",
      value: params.hasRepository
    });
  }
  if (params.hasLicense) {
    children.push({
      kind: "term",
      field: "has_license",
      operator: "eq",
      value: params.hasLicense
    });
  }
  return { kind: "group", op: "and", children };
}

export function decodeQueryAstFromParams(params: Pick<LegacySearchParamsShape, "ast" | "expr">): QueryAst | null {
  if (params.ast?.trim()) {
    return decodeQueryAst(params.ast);
  }
  if (params.expr?.trim()) {
    return parseNativeExpression(params.expr);
  }
  return null;
}

export function deriveQueryAst(params: LegacySearchParamsShape): QueryAst {
  return decodeQueryAstFromParams(params) ?? legacyParamsToAst(params);
}

function clearLegacyQueryFields(params: LegacySearchParamsShape): LegacySearchParamsShape {
  return {
    ...params,
    q: "",
    owner: "",
    packageName: "",
    keyword: "",
    description: "",
    license: "",
    repository: "",
    rank: "",
    momentum: "",
    minScore: "",
    maxScore: "",
    minDependents: "",
    minRecentDependents: "",
    minDownloads: "",
    fromYear: "",
    toYear: "",
    hasRepository: "",
    hasLicense: ""
  };
}

export function withQueryAst<T extends LegacySearchParamsShape>(params: T, ast: QueryAst): T {
  return {
    ...clearLegacyQueryFields(params),
    ast: encodeQueryAst(ast),
    expr: serializeQueryAst(ast)
  } as T;
}

export function clearStructuredQuery<T extends LegacySearchParamsShape>(params: T): T {
  return {
    ...params,
    ast: "",
    expr: ""
  };
}
