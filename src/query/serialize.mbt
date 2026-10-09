///|
/// Whether `value` can be written without quotes: it is made of
/// `[A-Za-z0-9_./-]` only and is not one of the keywords `AND`, `OR`, `NOT`.
fn is_bare_value(value : String) -> Bool {
  if value.equal_ignore_ascii_case("AND") ||
    value.equal_ignore_ascii_case("OR") ||
    value.equal_ignore_ascii_case("NOT") {
    return false
  }
  for i in 0..<value.length() {
    let code = value.at(i).to_int()
    let ok = (code >= 'A'.to_int() && code <= 'Z'.to_int()) ||
      (code >= 'a'.to_int() && code <= 'z'.to_int()) ||
      (code >= '0'.to_int() && code <= '9'.to_int()) ||
      code == '_'.to_int() ||
      code == '.'.to_int() ||
      code == '/'.to_int() ||
      code == '-'.to_int()
    if !ok {
      return false
    }
  }
  true
}

///|
fn encode_value(value : String) -> String {
  let trimmed = trim(value)
  if trimmed == "" {
    return "\"\""
  }
  if is_bare_value(trimmed) {
    return trimmed
  }
  let escaped = trimmed
    .replace_all(old="\\", new="\\\\")
    .replace_all(old="\"", new="\\\"")
  "\"\{escaped}\""
}

///|
/// Writes a term in the expression language, without its negation.
fn serialize_term(term : Term) -> String {
  let value = encode_value(term.value)
  match (term.operator, term.field) {
    (Match, Text) => value
    _ => term.field.name() + term.operator.symbol() + value
  }
}

///|
/// `parent` is the connective of the enclosing group. `operand` is true when
/// the node is the operand of `NOT`, which binds tighter than `AND` and `OR`
/// and so needs parentheses around any group of two or more children.
fn serialize_node(node : Node, parent : GroupOp?, operand : Bool) -> String {
  match node {
    Term(term) => {
      let inner = serialize_term(term)
      if term.negated {
        "NOT " + inner
      } else {
        inner
      }
    }
    Group(group) =>
      if group.negated {
        "NOT " + serialize_group_body(group, parent, true)
      } else {
        serialize_group_body(group, parent, operand)
      }
  }
}

///|
fn serialize_group_body(
  group : Group,
  parent : GroupOp?,
  operand : Bool,
) -> String {
  match group.children.length() {
    0 => "()"
    1 => serialize_node(group.children[0], Some(group.op), operand)
    _ => {
      let glue = if group.op is And { " AND " } else { " OR " }
      let body = group.children
        .map(child => serialize_node(child, Some(group.op), false))
        .join(glue)
      let needs_parens = operand || (parent is Some(outer) && outer != group.op)
      if needs_parens {
        "(\{body})"
      } else {
        body
      }
    }
  }
}

///|
/// Writes the query tree as an expression of the native query language.
///
/// Values are trimmed, and quoted unless they consist of
/// `[A-Za-z0-9_./-]` only and are not a keyword. A group is parenthesised
/// when its connective differs from the enclosing one or when it is negated.
/// For every tree the parser can produce, `parse_expression(serialize(ast))`
/// evaluates like `ast`. The language has no spelling for an empty group, so
/// one is written `()`, which does not parse back.
pub fn serialize(ast : Group) -> String {
  serialize_node(Group(ast), None, false)
}
