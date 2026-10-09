///|
fn compiled(expression : String) -> String {
  let ast = @query.parse_expression(expression) catch {
    error => return "query error: " + error.message()
  }
  let fragment = @query_sql.compile_ast(ast) catch {
    error => return "error: " + error.message()
  }
  fragment.to_json().stringify()
}

///|
test "text fields compile to FTS5 matches" {
  inspect(
    compiled("json"),
    content=(
      #|{"sql":"(EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?))","values":["json*"]}
    ),
  )
  inspect(
    compiled("\"json parser\""),
    content=(
      #|{"sql":"(EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?))","values":["\"json parser\""]}
    ),
  )
  inspect(
    compiled(
      "owner:gmlewis AND package:json5 AND keyword:parser AND description:\"fast json\"",
    ),
    content=(
      #|{"sql":"(EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) AND (EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) AND (EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) AND (EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?))","values":["owner : gmlewis*","package_name : json5*","keywords : parser*","description : \"fast json\""]}
    ),
  )
  inspect(
    compiled("text=json"),
    content=(
      #|error: Field `text` only supports text match
    ),
  )
  inspect(
    compiled("owner:\"!!\""),
    content=(
      #|error: Search field `owner` is empty
    ),
  )
  inspect(
    compiled("\"\""),
    content=(
      #|error: Unsupported search token ``
    ),
  )
}

///|
test "license and repository compile to LIKE" {
  inspect(
    compiled("license:MIT AND repository=\"100%_x\\\\\""),
    content=(
      #|{"sql":"(LOWER(COALESCE(p.license, '')) LIKE LOWER(?) ESCAPE '\\') AND (LOWER(COALESCE(p.repository, '')) LIKE LOWER(?) ESCAPE '\\')","values":["%MIT%","%100\\%\\_x\\\\%"]}
    ),
  )
  inspect(
    compiled("license>=1"),
    content=(
      #|error: Field `license` only supports text equality or match
    ),
  )
}

///|
test "labels are canonicalised" {
  inspect(
    compiled("rank=a AND momentum=\"rising\""),
    content=(
      #|{"sql":"(s.rank_label = ?) AND (s.momentum_label = ?)","values":["A","Rising"]}
    ),
  )
  inspect(
    compiled("rank:A"),
    content=(
      #|error: rank only supports =
    ),
  )
  inspect(
    compiled("rank=Z"),
    content=(
      #|error: rank must be one of S, A, B, C, D
    ),
  )
  inspect(
    compiled("momentum=Hot"),
    content=(
      #|error: momentum must be one of New, Rising, Stable, Cooling
    ),
  )
  inspect(
    compiled("rank=\" \""),
    content=(
      #|error: rank is empty
    ),
  )
  inspect(
    compiled("rank=\"S,A\""),
    content=(
      #|error: rank must be one of S, A, B, C, D
    ),
  )
}

///|
test "numeric fields bind numbers" {
  inspect(
    compiled("score>=180.5 AND dependents<=3 AND recent_dependents=1"),
    content=(
      #|{"sql":"(s.score >= ?) AND (p.dependent_count <= ?) AND (p.recent_dependent_count = ?)","values":[180.5,3,1]}
    ),
  )
  inspect(
    compiled(
      "external_dependents>=2 AND owners>=1 AND age<=30 AND position<=10 AND year>=2025 AND downloads>=0x10",
    ),
    content=(
      #|{"sql":"(p.external_dependent_count >= ?) AND (p.dependent_owner_count >= ?) AND (p.days_since_release <= ?) AND (s.rank_position <= ?) AND (CAST(substr(COALESCE(p.latest_created_at, ''), 1, 4) AS INTEGER) >= ?) AND (p.download_count >= ?)","values":[2,1,30,10,2025,16]}
    ),
  )
  inspect(
    compiled("score>=abc"),
    content=(
      #|error: score must be a valid number
    ),
  )
  inspect(
    compiled("dependents>=1.5"),
    content=(
      #|error: dependents must be an integer
    ),
  )
  inspect(
    compiled("score>=\"\""),
    content=(
      #|error: score is empty
    ),
  )
  inspect(
    compiled("score>=\" \""),
    content=(
      #|{"sql":"(s.score >= ?)","values":[0]}
    ),
  )
  inspect(
    compiled("score:5"),
    content=(
      #|error: score does not support text match
    ),
  )
}

///|
test "presence flags" {
  inspect(
    compiled("has_repository=true AND has_license=false"),
    content=(
      #|{"sql":"(p.repository IS NOT NULL AND trim(p.repository) <> '') AND ((p.license IS NULL OR trim(p.license) = ''))","values":[]}
    ),
  )
  inspect(
    compiled("has_license=yes"),
    content=(
      #|error: has_license must be either true or false
    ),
  )
  inspect(
    compiled("has_license:true"),
    content=(
      #|error: has_license only supports =
    ),
  )
  inspect(
    compiled("has_license=\"\""),
    content=(
      #|error: has_license is empty
    ),
  )
}

///|
test "groups and negation" {
  inspect(
    compiled("(owner:alice OR keyword:helper) AND score>=80"),
    content=(
      #|{"sql":"((EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)) OR (EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?))) AND (s.score >= ?)","values":["owner : alice*","keywords : helper*",80]}
    ),
  )
  inspect(
    compiled("NOT (rank=D OR json) AND NOT license:GPL"),
    content=(
      #|{"sql":"(NOT ((s.rank_label = ?) OR (EXISTS (SELECT 1 FROM search_index WHERE rowid = p.id AND search_index MATCH ?)))) AND (NOT (LOWER(COALESCE(p.license, '')) LIKE LOWER(?) ESCAPE '\\'))","values":["D","json*","%GPL%"]}
    ),
  )
  let empty = @query_sql.compile_ast(@query.empty_ast())
  inspect(
    empty.to_json().stringify(),
    content=(
      #|{"sql":"1 = 1","values":[]}
    ),
  )
}

///|
test "free-text q syntax" {
  fn fts(input : String) -> String {
    @query_sql.compile_fts_expression(input) catch {
      error => "error: " + error.message()
    }
  }

  inspect(
    fts("owner:alice AND package:toolkit"),
    content=(
      #|owner : alice* AND package_name : toolkit*
    ),
  )
  inspect(
    fts("toolkit NOT helper"),
    content=(
      #|toolkit* NOT helper*
    ),
  )
  inspect(
    fts("(json OR yaml) AND tag:parser* AND \"fast   json\""),
    content=(
      #|( json* OR yaml* ) AND keywords : parser* AND "fast json"
    ),
  )
  inspect(
    fts("moonbit-community/json5"),
    content=(
      #|"moonbit-community json5"
    ),
  )
  inspect(
    fts("and"),
    content=(
      #|error: Search query cannot start with `AND`
    ),
  )
  inspect(
    fts("AND"),
    content=(
      #|error: Search query cannot start with `AND`
    ),
  )
  inspect(
    fts("foo AND"),
    content=(
      #|error: Search query cannot end with a boolean operator
    ),
  )
  inspect(
    fts("\"foo"),
    content=(
      #|error: Unclosed quoted phrase in search query
    ),
  )
  inspect(
    fts("( foo"),
    content=(
      #|error: Unbalanced parentheses in search query
    ),
  )
  inspect(
    fts("foo )"),
    content=(
      #|error: Unexpected closing parenthesis in search query
    ),
  )
  inspect(
    fts("foo (bar)"),
    content=(
      #|error: Missing boolean operator before opening parenthesis
    ),
  )
  inspect(
    fts("foo bar"),
    content=(
      #|error: Missing boolean operator between search terms
    ),
  )
  inspect(
    fts("color:red"),
    content=(
      #|error: Unsupported search field `color`. Use owner, package, keyword, description, or name
    ),
  )
  inspect(
    fts("!!!"),
    content=(
      #|error: Unsupported search token `!!!`
    ),
  )
  inspect(
    fts("\"!!\""),
    content=(
      #|error: Empty quoted phrase in search query
    ),
  )
  inspect(
    fts(""),
    content=(
      #|error: Search query is empty
    ),
  )
}

///|
test "like patterns escape wildcards" {
  inspect(
    @query_sql.escape_like_pattern("100%_a\\b"),
    content=(
      #|100\%\_a\\b
    ),
  )
  inspect(
    @query_sql.normalize_fts_text("  a/b:c, d.e-f*#g 原 "),
    content=(
      #|a b c d.e-f*#g
    ),
  )
}
