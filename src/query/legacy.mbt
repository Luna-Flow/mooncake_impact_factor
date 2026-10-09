///|
/// One flat search parameter of the web interface (the "legacy" form, from
/// before the query language) and the term it stands for.
pub(all) struct LegacyParam {
  /// Parameter name, as in the web interface state, for example
  /// `"minScore"`.
  key : String
  field : Field
  operator : Operator
  /// Whether the value is trimmed before use. Only the two presence flags
  /// keep their value as given.
  trimmed : Bool
} derive(Eq, Debug)

///|
let legacy_param_list : FixedArray[LegacyParam] = [
  { key: "q", field: Text, operator: Match, trimmed: true, },
  { key: "owner", field: Owner, operator: Match, trimmed: true, },
  { key: "packageName", field: Package, operator: Match, trimmed: true, },
  { key: "keyword", field: Keyword, operator: Match, trimmed: true, },
  { key: "description", field: Description, operator: Match, trimmed: true, },
  { key: "license", field: License, operator: Match, trimmed: true, },
  { key: "repository", field: Repository, operator: Match, trimmed: true, },
  { key: "rank", field: Rank, operator: Eq, trimmed: true, },
  { key: "momentum", field: Momentum, operator: Eq, trimmed: true, },
  { key: "minScore", field: Score, operator: Gte, trimmed: true, },
  { key: "maxScore", field: Score, operator: Lte, trimmed: true, },
  { key: "minDependents", field: Dependents, operator: Gte, trimmed: true, },
  {
    key: "minRecentDependents",
    field: RecentDependents,
    operator: Gte,
    trimmed: true,
  },
  { key: "minDownloads", field: Downloads, operator: Gte, trimmed: true, },
  { key: "fromYear", field: Year, operator: Gte, trimmed: true, },
  { key: "toYear", field: Year, operator: Lte, trimmed: true, },
  {
    key: "minExternalDependents",
    field: ExternalDependents,
    operator: Gte,
    trimmed: true,
  },
  { key: "minOwners", field: Owners, operator: Gte, trimmed: true, },
  { key: "maxAge", field: Age, operator: Lte, trimmed: true, },
  { key: "hasRepository", field: HasRepository, operator: Eq, trimmed: false, },
  { key: "hasLicense", field: HasLicense, operator: Eq, trimmed: false, },
]

///|
/// The flat search parameters, in the order their terms are added by
/// `legacy_params_to_ast`.
pub fn legacy_params() -> Array[LegacyParam] {
  Array::from_iter(legacy_param_list.iter())
}

///|
/// Converts flat parameters to a query tree: an `And` group with one term
/// per non-blank parameter, in the order of `legacy_params()`. Missing keys
/// count as blank; keys that are not flat parameters are ignored.
pub fn legacy_params_to_ast(params : Map[String, String]) -> Group {
  let children : Array[Node] = []
  for param in legacy_param_list {
    let raw = params.get(param.key).unwrap_or("")
    let value = if param.trimmed { trim(raw) } else { raw }
    if value != "" {
      children.push(term(param.field, param.operator, value))
    }
  }
  Group::make(And, children)
}

///|
/// The query tree carried by the `ast` or `expr` parameter, if any.
///
/// A non-blank `ast` wins and is decoded with `decode`; otherwise a
/// non-blank `expr` is parsed with `parse_expression`; otherwise the result
/// is `None`.
pub fn decode_from_params(
  params : Map[String, String],
) -> Group? raise QueryError {
  let ast = params.get("ast").unwrap_or("")
  if trim(ast) != "" {
    return Some(decode(ast))
  }
  let expr = params.get("expr").unwrap_or("")
  if trim(expr) != "" {
    return Some(parse_expression(expr))
  }
  None
}

///|
/// The query tree a set of search parameters stands for:
/// `decode_from_params` when it finds one, `legacy_params_to_ast` otherwise.
pub fn derive_ast(params : Map[String, String]) -> Group raise QueryError {
  match decode_from_params(params) {
    Some(ast) => ast
    None => legacy_params_to_ast(params)
  }
}

///|
/// The parameter changes that make `ast` the active query: every flat
/// parameter set to `""`, `ast` set to `encode(ast)` and `expr` to
/// `serialize(ast)`.
pub fn with_query_ast_patch(ast : Group) -> Map[String, String] {
  let patch : Map[String, String] = Map([])
  for param in legacy_param_list {
    patch[param.key] = ""
  }
  patch["ast"] = encode(ast)
  patch["expr"] = serialize(ast)
  patch
}
