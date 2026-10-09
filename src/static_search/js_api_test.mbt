///|
let index_json : String =
  #|{"items":[
  #| {"full_name":"alice/json","owner":"alice","rank_label":"A","momentum_label":"Rising","score":200,
  #|  "score_growth_30d":5,"download_count":10,"dependent_count":3,"recent_dependent_count":1,
  #|  "external_dependent_count":2,"dependent_owner_count":2,"days_since_release":12,"rank_position":1,
  #|  "latest_created_at":"2026-01-01T00:00:00Z","repository_present":true,"license_present":true,
  #|  "normalized_full_text":"alice/json alice json json parser","normalized_owner":"alice",
  #|  "normalized_package":"json","normalized_description":"json parser","normalized_license":"mit",
  #|  "normalized_repository":"https://example.com/json","normalized_keywords":["json"]},
  #| {"full_name":"bob/csv","rank_label":"C","momentum_label":"New","score":60,
  #|  "score_growth_30d":0,"download_count":0,"dependent_count":0,"recent_dependent_count":0,
  #|  "external_dependent_count":0,"dependent_owner_count":0,"days_since_release":400,"rank_position":2,
  #|  "latest_created_at":null,"repository_present":false,"license_present":false,
  #|  "normalized_full_text":"bob/csv bob csv","normalized_owner":"bob",
  #|  "normalized_package":"csv","normalized_description":"","normalized_license":"",
  #|  "normalized_repository":"","normalized_keywords":[]}
  #|]}

///|
test "load_index and search" {
  inspect(
    @static_search.load_index(index_json),
    content=(
      #|2
    ),
  )
  inspect(
    @static_search.search("{}"),
    content=(
      #|{"ok":{"indices":[0,1],"total":2}}
    ),
  )
  inspect(
    @static_search.search("{\"q\":\"json\"}"),
    content=(
      #|{"ok":{"indices":[0],"total":1}}
    ),
  )
  inspect(
    @static_search.search("{\"minOwners\":\"1\",\"maxAge\":\"30\"}"),
    content=(
      #|{"ok":{"indices":[0],"total":1}}
    ),
  )
  inspect(
    @static_search.search(
      "{\"momentum\":\"new,rising\",\"sort\":\"age\",\"limit\":\"1\"}",
    ),
    content=(
      #|{"ok":{"indices":[0],"total":2}}
    ),
  )
  inspect(
    @static_search.search("{\"expr\":\"owner:\"}"),
    content=(
      #|{"error":"Missing query value"}
    ),
  )
  inspect(
    @static_search.search("{\"rank\":\"Z\"}"),
    content=(
      #|{"error":"rank must be one of S, A, B, C, D"}
    ),
  )
  inspect(
    @static_search.search("nope"),
    content=(
      #|{"error":"Invalid JSON input: Invalid character 'o' at line 1, column 1"}
    ),
  )
  inspect(
    @static_search.load_index("{\"items\":[{}]}"),
    content=(
      #|-1
    ),
  )
  // A failed load keeps the previous index.
  inspect(
    @static_search.search("{\"sort\":\"name\",\"order\":\"desc\"}"),
    content=(
      #|{"ok":{"indices":[1,0],"total":2}}
    ),
  )
}

///|
test "evaluate_json and relevance_json" {
  let item = "{\"full_name\":\"a/b\",\"rank_label\":\"D\",\"momentum_label\":\"Stable\",\"score\":1,\"score_growth_30d\":0,\"download_count\":0,\"dependent_count\":0,\"recent_dependent_count\":0,\"external_dependent_count\":0,\"dependent_owner_count\":0,\"days_since_release\":0,\"rank_position\":9,\"latest_created_at\":null,\"repository_present\":false,\"license_present\":false,\"normalized_full_text\":\"a/b json\",\"normalized_owner\":\"a\",\"normalized_package\":\"b\",\"normalized_description\":\"json\",\"normalized_license\":\"\",\"normalized_repository\":\"\",\"normalized_keywords\":[]}"
  let ast = @query.encode(@query.parse_expression("NOT rank=D OR json"))
  inspect(
    @static_search.evaluate_json(item, ast),
    content=(
      #|{"ok":true}
    ),
  )
  inspect(
    @static_search.relevance_json(item, ast),
    content=(
      #|{"ok":1}
    ),
  )
  inspect(
    @static_search.relevance_json("{}", ast),
    content=(
      #|{"error":"Index item field `normalized_keywords` must be an array of strings"}
    ),
  )
  inspect(
    @static_search.evaluate_json(item, "{}"),
    content=(
      #|{"error":"Query AST root must be a group"}
    ),
  )
}
