///|
/// A value bound to a `?` placeholder.
pub(all) enum SqlValue {
  Text(String)
  Number(Double)
} derive(Eq, Debug)

///|
/// A JSON string or number.
pub impl ToJson for SqlValue with fn to_json(self) {
  match self {
    Text(text) => text.to_json()
    Number(number) => Json::number(number)
  }
}

///|
pub extend SqlValue with ToJson::{to_json}

///|
/// A piece of SQL with its placeholder values, in placeholder order.
pub(all) struct Fragment {
  sql : String
  values : Array[SqlValue]
} derive(Eq, Debug)

///|
/// `{"sql":…,"values":[…]}`
pub impl ToJson for Fragment with fn to_json(self) {
  Json::object({
    "sql": self.sql.to_json(),
    "values": Json::array(self.values.map(value => value.to_json())),
  })
}

///|
pub extend Fragment with ToJson::{to_json}

///|
/// Reads a numeric parameter: `None` for `""`, otherwise
/// `@query.number_value(value)`, which must be finite. With `integer`, it
/// must also be a whole number. The errors name the parameter `label`.
pub fn parse_number(
  value : String,
  label : String,
  integer? : Bool = false,
) -> Double? raise SqlError {
  if value == "" {
    return None
  }
  let parsed = @query.number_value(value)
  if integer {
    if parsed.is_nan() || parsed.is_inf() || parsed.trunc() != parsed {
      raise SqlError("\{label} must be an integer")
    }
  } else if parsed.is_nan() || parsed.is_inf() {
    raise SqlError("\{label} must be a valid number")
  }
  Some(parsed)
}

///|
/// Reads a boolean parameter: `None` for `""`, `true` and `false` as
/// themselves, anything else an error naming `label`.
pub fn parse_boolean(value : String, label : String) -> Bool? raise SqlError {
  match value {
    "" => None
    "true" => Some(true)
    "false" => Some(false)
    _ => raise SqlError("\{label} must be either true or false")
  }
}

///|
fn sql_error_of(error : @query.QueryError) -> SqlError {
  SqlError(error.message())
}

///|
/// The labels of a comma-separated rank list (see `@query.parse_rank_list`),
/// with unknown labels raised as `SqlError`.
pub fn normalize_rank_labels(input : String) -> Array[String] raise SqlError {
  @query.parse_rank_list(input) catch {
    error => raise sql_error_of(error)
  }
}

///|
/// The labels of a comma-separated momentum list (see
/// `@query.parse_momentum_list`), with unknown labels raised as `SqlError`.
pub fn normalize_momentum_labels(
  input : String,
) -> Array[String] raise SqlError {
  @query.parse_momentum_list(input) catch {
    error => raise sql_error_of(error)
  }
}

///|
/// `column = ?` for one label, `column IN (?, …)` for several, `None` for
/// none.
fn label_condition(column : String, labels : Array[String]) -> Fragment? {
  match labels {
    [] => None
    [label] => Some({ sql: "\{column} = ?", values: [Text(label)], })
    _ => {
      let marks = labels.map(_ => "?").join(", ")
      Some({
        sql: "\{column} IN (\{marks})",
        values: labels.map(label => Text(label)),
      })
    }
  }
}

///|
fn like_condition(column : String, value : String) -> Fragment {
  {
    sql: "LOWER(COALESCE(\{column}, '')) LIKE LOWER(?) ESCAPE '\\'",
    values: [Text("%" + escape_like_pattern(value) + "%")],
  }
}

///|
fn presence_condition(column : String, present : Bool) -> Fragment {
  {
    sql: if present {
      "\{column} IS NOT NULL AND trim(\{column}) <> ''"
    } else {
      "(\{column} IS NULL OR trim(\{column}) = '')"
    },
    values: [],
  }
}

///|
let fts_match_sql = "EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)"

///|
let year_sql = "CAST(substr(COALESCE(p.latest_created_at, ''), 1, 4) AS INTEGER)"

///|
/// The SQL expression and integer flag of a numeric field.
fn numeric_column(field : @query.Field) -> (String, Bool)? {
  match field {
    Score => Some(("s.score", false))
    Dependents => Some(("p.dependent_count", true))
    RecentDependents => Some(("p.recent_dependent_count", true))
    ExternalDependents => Some(("p.external_dependent_count", true))
    Owners => Some(("p.dependent_owner_count", true))
    Downloads => Some(("p.download_count", true))
    Year => Some((year_sql, true))
    Age => Some(("p.days_since_release", true))
    Position => Some(("s.rank_position", true))
    _ => None
  }
}

///|
fn compile_numeric_term(
  column : String,
  term : @query.Term,
  integer : Bool,
) -> Fragment raise SqlError {
  let label = term.field.name()
  guard parse_number(term.value, label, integer~) is Some(parsed) else {
    raise SqlError("\{label} is empty")
  }
  let comparison = match term.operator {
    Eq => "="
    Gte => ">="
    Lte => "<="
    Match => raise SqlError("\{label} does not support text match")
  }
  { sql: "\{column} \{comparison} ?", values: [Number(parsed)], }
}

///|
fn compile_label_term(
  column : String,
  term : @query.Term,
) -> Fragment raise SqlError {
  let label = term.field.name()
  if term.operator != Eq {
    raise SqlError("\{label} only supports =")
  }
  let value = @query.trim(term.value)
  if value == "" {
    raise SqlError("\{label} is empty")
  }
  let canonical = @query.parse_label(term.field, value) catch {
    error => raise sql_error_of(error)
  }
  { sql: "\{column} = ?", values: [Text(canonical)], }
}

///|
fn compile_term(term : @query.Term) -> Fragment raise SqlError {
  let label = term.field.name()
  match term.field {
    Text | Owner | Package | Keyword | Description => {
      if term.operator != Match {
        raise SqlError("Field `\{label}` only supports text match")
      }
      let expression = match term.field {
        Text => compile_fts_value(term.value)
        _ => {
          let column = map_field_alias(label).unwrap()
          "\{column} : \{compile_literal_field_value(term.value, label)}"
        }
      }
      { sql: fts_match_sql, values: [Text(expression)], }
    }
    License | Repository => {
      if term.operator != Match && term.operator != Eq {
        raise SqlError("Field `\{label}` only supports text equality or match")
      }
      like_condition("p.\{label}", term.value)
    }
    Rank => compile_label_term("s.rank_label", term)
    Momentum => compile_label_term("s.momentum_label", term)
    HasRepository | HasLicense => {
      if term.operator != Eq {
        raise SqlError("\{label} only supports =")
      }
      guard parse_boolean(term.value, label) is Some(present) else {
        raise SqlError("\{label} is empty")
      }
      let column = if term.field is HasRepository {
        "p.repository"
      } else {
        "p.license"
      }
      presence_condition(column, present)
    }
    _ => {
      guard numeric_column(term.field) is Some((column, integer)) else {
        raise SqlError("Unsupported query field `\{label}`")
      }
      compile_numeric_term(column, term, integer)
    }
  }
}

///|
fn negate(fragment : Fragment) -> Fragment {
  { sql: "NOT (\{fragment.sql})", values: fragment.values, }
}

///|
fn compile_node(node : @query.Node) -> Fragment raise SqlError {
  match node {
    Term(term) => {
      let compiled = compile_term(term)
      if term.negated {
        negate(compiled)
      } else {
        compiled
      }
    }
    Group(group) => {
      let compiled = compile_group(group)
      if group.negated {
        negate(compiled)
      } else {
        compiled
      }
    }
  }
}

///|
fn compile_group(group : @query.Group) -> Fragment raise SqlError {
  if group.children.is_empty() {
    return { sql: "1 = 1", values: [], }
  }
  let parts = []
  let values = []
  for child in group.children {
    let compiled = compile_node(child)
    parts.push("(\{compiled.sql})")
    values.append(compiled.values)
  }
  let glue = if group.op is And { " AND " } else { " OR " }
  { sql: parts.join(glue), values, }
}

///|
/// Compiles a query tree into a `WHERE` condition over `packages p` joined
/// with `package_scores s`.
///
/// Text fields become an FTS5 `MATCH` in an `EXISTS` subquery, `license`
/// and `repository` a case-insensitive `LIKE`, labels an equality with the
/// canonical label, numeric fields a comparison with a bound number, and
/// the presence flags a test for a non-blank column. An empty group is
/// `1 = 1`; negation wraps the part in `NOT (…)`. Every child is wrapped in
/// parentheses, so the SQL precedence never matters.
pub fn compile_ast(ast : @query.Group) -> Fragment raise SqlError {
  compile_node(Group(ast))
}
