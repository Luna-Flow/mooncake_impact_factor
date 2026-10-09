// String-in, string-out entry points for the JavaScript build (the search
// worker), exported by the `js` link options of this package. Calls that
// can fail return an envelope: `{"ok":<result>}` or `{"error":"<message>"}`.

///|
/// The index `load_index` stored for `search`.
let loaded_items : Ref[Array[IndexItem]] = { val: [], }

///|
fn envelope(result : Result[Json, String]) -> String {
  match result {
    Ok(value) => Json::object({ "ok": value }).stringify()
    Err(message) => Json::object({ "error": message.to_json() }).stringify()
  }
}

///|
/// Parses an index document (see `parse_index`), keeps its items for
/// `search` and returns how many there are. On error the previous index is
/// kept and the result is `-1`.
pub fn load_index(json : String) -> Int {
  let items = parse_index(json) catch { _ => return -1 }
  loaded_items.val = items
  items.length()
}

///|
/// Envelope of `search_items` over the loaded index for a JSON object of
/// search parameters: `{"indices":[…],"total":n}`, where the indices refer
/// to the items in index order.
pub fn search(params_json : String) -> String {
  let params = @json.parse(params_json) catch {
    error => return envelope(Err("Invalid JSON input: \{error}"))
  }
  let result = search_items(loaded_items.val, @query.params_from_json(params)) catch {
    error => return envelope(Err(error.message()))
  }
  envelope(Ok(result.to_json()))
}

///|
fn item_and_ast(
  item_json : String,
  ast_json : String,
) -> (IndexItem, @query.Group) raise Error {
  let item = IndexItem::from_json(@json.parse(item_json))
  (item, @query.decode(ast_json))
}

///|
/// Envelope of `evaluate` for one index item and one query tree, both JSON
/// text: a boolean.
pub fn evaluate_json(item_json : String, ast_json : String) -> String {
  let (item, ast) = item_and_ast(item_json, ast_json) catch {
    error => return envelope(Err(error_message(error)))
  }
  envelope(Ok(evaluate(item, Group(ast)).to_json()))
}

///|
/// Envelope of `relevance` for one index item and one query tree, both JSON
/// text: a number.
pub fn relevance_json(item_json : String, ast_json : String) -> String {
  let (item, ast) = item_and_ast(item_json, ast_json) catch {
    error => return envelope(Err(error_message(error)))
  }
  envelope(Ok(relevance(item, ast).to_json()))
}

///|
fn error_message(error : Error) -> String {
  match error {
    IndexError(message) => message
    @query.QueryError(message) => message
    _ => "Invalid JSON input"
  }
}
