// String-in, string-out entry points for the JavaScript build, exported by
// the `js` link options of this package. Each returns an envelope:
// `{"ok":<result>}` or `{"error":"<message>"}`; the server answers an error
// with HTTP 400.

///|
fn envelope(result : Result[Json, String]) -> String {
  match result {
    Ok(value) => Json::object({ "ok": value }).stringify()
    Err(message) => Json::object({ "error": message.to_json() }).stringify()
  }
}

///|
/// Envelope of `compile_ast` for a query tree in JSON text:
/// `{"sql":…,"values":[…]}`.
pub fn compile_ast_json(ast_json : String) -> String {
  let ast = @query.decode(ast_json) catch {
    error => return envelope(Err(error.message()))
  }
  let fragment = compile_ast(ast) catch {
    error => return envelope(Err(error.message()))
  }
  envelope(Ok(fragment.to_json()))
}

///|
/// Envelope of `plan_search` for a JSON object of URL parameters. Members
/// that are not strings are ignored.
pub fn plan_search_json(params_json : String) -> String {
  let json = @json.parse(params_json) catch {
    error => return envelope(Err("Invalid JSON input: \{error}"))
  }
  let plan = plan_search(@query.params_from_json(json)) catch {
    error => return envelope(Err(error.message()))
  }
  envelope(Ok(plan.to_json()))
}
