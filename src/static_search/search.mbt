///|
extern "js" fn lower(input : String) -> String =
  #| (input) => input.toLowerCase()

///|
pub fn runtime_version() -> String {
  "static-search-js-v1"
}

///|
pub fn normalize_text(input : String) -> String {
  lower(input)
}
