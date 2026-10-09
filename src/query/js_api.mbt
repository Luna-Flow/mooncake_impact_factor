// String-in, string-out entry points for the JavaScript build. They are
// ordinary MoonBit functions, so they are tested on every backend, and the
// `js` link options of this package export them from the generated ES
// module. A call that can fail returns an envelope: `{"ok":<result>}` or
// `{"error":"<message>"}`.

///|
fn envelope_ok(value : Json) -> String {
  Json::object({ "ok": value }).stringify()
}

///|
fn envelope_error(message : String) -> String {
  Json::object({ "error": message.to_json() }).stringify()
}

///|
fn parse_json_text(text : String) -> Json raise QueryError {
  @json.parse(text) catch {
    error => raise QueryError("Invalid JSON input: \{error}")
  }
}

///|
/// The string-valued members of a JSON object. Other members, and any
/// non-object input, are ignored.
pub fn params_from_json(input : Json) -> Map[String, String] {
  let params : Map[String, String] = Map([])
  if input is Object(fields) {
    for key, value in fields {
      if value is String(text) {
        params[key] = text
      }
    }
  }
  params
}

///|
/// JSON text of `empty_ast()`.
pub fn empty_ast_json() -> String {
  encode(empty_ast())
}

///|
/// `has_intent` of the query tree in JSON text; `false` when the text is not
/// a valid query tree.
pub fn has_intent_json(ast_json : String) -> Bool {
  let ast = decode(ast_json) catch { _ => return false }
  ast.has_intent()
}

///|
/// Envelope of `validate` applied to JSON text: the normalised tree.
pub fn validate_json(input_json : String) -> String {
  let ast = validate(parse_json_text(input_json)) catch {
    error => return envelope_error(error.message())
  }
  envelope_ok(ast.to_json())
}

///|
/// Envelope of `parse_expression`: the tree in JSON form.
pub fn parse_expression_json(input : String) -> String {
  let ast = parse_expression(input) catch {
    error => return envelope_error(error.message())
  }
  envelope_ok(ast.to_json())
}

///|
/// Envelope of `serialize` applied to a tree in JSON text: the expression
/// as a JSON string.
pub fn serialize_json(ast_json : String) -> String {
  let ast = validate(parse_json_text(ast_json)) catch {
    error => return envelope_error(error.message())
  }
  envelope_ok(serialize(ast).to_json())
}

///|
/// Envelope of `derive_ast` applied to a JSON object of search parameters.
pub fn derive_ast_json(params_json : String) -> String {
  let ast = derive_ast(params_from_json(parse_json_text(params_json))) catch {
    error => return envelope_error(error.message())
  }
  envelope_ok(ast.to_json())
}

///|
/// Envelope of `decode_from_params` applied to a JSON object of search
/// parameters: the tree, or `null`.
pub fn decode_from_params_json(params_json : String) -> String {
  let ast = decode_from_params(params_from_json(parse_json_text(params_json))) catch {
    error => return envelope_error(error.message())
  }
  match ast {
    Some(tree) => envelope_ok(tree.to_json())
    None => envelope_ok(Json::null())
  }
}

///|
/// Envelope of `with_query_ast_patch` applied to a tree in JSON text: an
/// object mapping parameter names to their new values.
pub fn with_query_ast_patch_json(ast_json : String) -> String {
  let ast = validate(parse_json_text(ast_json)) catch {
    error => return envelope_error(error.message())
  }
  envelope_ok(with_query_ast_patch(ast).to_json())
}

///|
/// JSON array of `rank_labels()`.
pub fn rank_labels_json() -> String {
  rank_labels().to_json().stringify()
}

///|
/// JSON array of `momentum_labels()`.
pub fn momentum_labels_json() -> String {
  momentum_labels().to_json().stringify()
}
