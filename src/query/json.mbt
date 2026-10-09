///|
/// `{"kind":"term","field":…,"operator":…,"value":…}`, with
/// `"negated":true` added only when the term is negated.
pub impl ToJson for Term with fn to_json(self) {
  let object : Map[String, Json] = {
    "kind": "term",
    "field": self.field.name().to_json(),
    "operator": self.operator.name().to_json(),
    "value": self.value.to_json(),
  }
  if self.negated {
    object["negated"] = true
  }
  Json::object(object)
}

///|
/// `{"kind":"group","op":…,"children":[…]}`, with `"negated":true` added
/// only when the group is negated.
pub impl ToJson for Group with fn to_json(self) {
  let object : Map[String, Json] = {
    "kind": "group",
    "op": self.op.name().to_json(),
    "children": Json::array(self.children.map(child => child.to_json())),
  }
  if self.negated {
    object["negated"] = true
  }
  Json::object(object)
}

///|
pub impl ToJson for Node with fn to_json(self) {
  match self {
    Term(term) => term.to_json()
    Group(group) => group.to_json()
  }
}

///|
/// The text ECMAScript `String(value ?? "")` gives for a JSON value. The
/// validator builds its messages and reads `op` and `field` this way, as the
/// TypeScript validator did.
fn js_string(value : Json?) -> String {
  match value {
    None | Some(Null) => ""
    Some(True) => "true"
    Some(False) => "false"
    Some(Number(number, ..)) => number.to_string()
    Some(String(text)) => text
    Some(Array(items)) =>
      items
      .map(item => {
        match item {
          Null => ""
          _ => js_string(Some(item))
        }
      })
      .join(",")
    Some(Object(_)) => "[object Object]"
  }
}

///|
/// Fields of a JSON object; arrays count as objects without fields, like in
/// ECMAScript.
fn record_fields(value : Json) -> Map[String, Json]? {
  match value {
    Object(fields) => Some(fields)
    Array(_) => Some(Map([]))
    _ => None
  }
}

///|
fn kind_is(fields : Map[String, Json], kind : String) -> Bool {
  fields.get("kind") is Some(String(text)) && text == kind
}

///|
fn negated_flag(fields : Map[String, Json]) -> Bool {
  fields.get("negated") is Some(True)
}

///|
fn validate_group(fields : Map[String, Json]) -> Group raise QueryError {
  if !kind_is(fields, "group") {
    raise QueryError("Expected query group node")
  }
  guard GroupOp::from_name(js_string(fields.get("op"))) is Some(op) else {
    raise QueryError("Query group operator must be and or or")
  }
  guard fields.get("children") is Some(Array(items)) else {
    raise QueryError("Query group children must be an array")
  }
  let negated = negated_flag(fields)
  let children = []
  for item in items {
    children.push(validate_node(item))
  }
  Group::make(op, children, negated~)
}

///|
fn validate_term(fields : Map[String, Json]) -> Term raise QueryError {
  if !kind_is(fields, "term") {
    raise QueryError("Expected query term node")
  }
  let field_name = js_string(fields.get("field"))
  let operator_name = js_string(fields.get("operator"))
  guard Field::from_name(field_name) is Some(field) else {
    raise QueryError("Unsupported query field `\{field_name}`")
  }
  guard Operator::from_name(operator_name) is Some(operator) else {
    raise QueryError("Unsupported query operator `\{operator_name}`")
  }
  guard fields.get("value") is Some(String(value)) else {
    raise QueryError("Query term value must be a string")
  }
  Term::make(field, operator, value, negated=negated_flag(fields))
}

///|
fn validate_node(input : Json) -> Node raise QueryError {
  guard record_fields(input) is Some(fields) else {
    raise QueryError("Query node must be an object")
  }
  if kind_is(fields, "group") {
    Group(validate_group(fields))
  } else if kind_is(fields, "term") {
    Term(validate_term(fields))
  } else {
    raise QueryError("Unknown query node kind")
  }
}

///|
/// Checks that `input` is a query tree in the JSON form and converts it.
///
/// The root must be a group. `negated` counts only when it is `true`; other
/// keys are ignored. Errors name the first problem found, depth first.
pub fn validate(input : Json) -> Group raise QueryError {
  guard record_fields(input) is Some(fields) else {
    raise QueryError("Query AST must be an object")
  }
  if !kind_is(fields, "group") {
    raise QueryError("Query AST root must be a group")
  }
  validate_group(fields)
}

///|
/// The JSON text of the query tree, as used in the `ast` URL parameter.
pub fn encode(ast : Group) -> String {
  ast.to_json().stringify()
}

///|
/// Parses JSON text and validates it with `validate`.
pub fn decode(encoded : String) -> Group raise QueryError {
  let json = @json.parse(encoded) catch {
    error => raise QueryError("Query AST is not valid JSON: \{error}")
  }
  validate(json)
}

///|
pub extend Term with ToJson::{to_json}

///|
pub extend Group with ToJson::{to_json}

///|
pub extend Node with ToJson::{to_json}
