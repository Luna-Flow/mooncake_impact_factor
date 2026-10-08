///|
test "runtime version is exported" {
  inspect(@static_search.runtime_version(), content="static-search-js-v1")
}
