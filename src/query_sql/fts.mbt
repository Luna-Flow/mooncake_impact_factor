///|
/// Error raised for a search request the database cannot run. The server
/// answers it with HTTP 400 and the message.
pub suberror SqlError {
  SqlError(String)
} derive(Eq, Debug)

///|
/// The message carried by the error.
pub fn SqlError::message(self : SqlError) -> String {
  match self {
    SqlError(message) => message
  }
}

///|
fn is_ascii_alnum(code : Int) -> Bool {
  (code >= 'A'.to_int() && code <= 'Z'.to_int()) ||
  (code >= 'a'.to_int() && code <= 'z'.to_int()) ||
  (code >= '0'.to_int() && code <= '9'.to_int())
}

///|
/// Characters FTS5 sees as part of a word in this index: ASCII letters and
/// digits and `_ . - * #`.
fn is_fts_word_code(code : Int) -> Bool {
  is_ascii_alnum(code) ||
  code == '_'.to_int() ||
  code == '.'.to_int() ||
  code == '-'.to_int() ||
  code == '*'.to_int() ||
  code == '#'.to_int()
}

///|
/// Whether the text has a character outside `[A-Za-z0-9_*]`, which FTS5
/// needs quoted.
fn needs_fts_quotes(text : String) -> Bool {
  for i in 0..<text.length() {
    let code = text.at(i).to_int()
    if !(is_ascii_alnum(code) || code == '_'.to_int() || code == '*'.to_int()) {
      return true
    }
  }
  false
}

///|
/// Keeps the FTS word characters of `input` (see `is_fts_word_code`) and
/// replaces every run of other characters with one space, without leading
/// or trailing spaces.
pub fn normalize_fts_text(input : String) -> String {
  let words : Array[String] = []
  let len = input.length()
  let mut start = -1
  for i in 0..<len {
    if is_fts_word_code(input.at(i).to_int()) {
      if start < 0 {
        start = i
      }
    } else if start >= 0 {
      words.push(input.unsafe_substring(start~, end=i))
      start = -1
    }
  }
  if start >= 0 {
    words.push(input.unsafe_substring(start~, end=len))
  }
  words.join(" ")
}

///|
/// Escapes `\`, `%` and `_` for a `LIKE … ESCAPE '\'` pattern.
pub fn escape_like_pattern(input : String) -> String {
  input
  .replace_all(old="\\", new="\\\\")
  .replace_all(old="%", new="\\%")
  .replace_all(old="_", new="\\_")
}

///|
/// Compiles one FTS5 operand. A token in double quotes becomes a phrase;
/// otherwise the normalised token becomes a phrase when it has several
/// words or punctuation, and a prefix query (`json*`) when it is one plain
/// word.
pub fn compile_fts_value(token : String) -> String raise SqlError {
  if token.has_prefix("\"") {
    if !token.has_suffix("\"") || token.length() < 2 {
      raise SqlError("Unclosed quoted phrase in search query")
    }
    let inner = normalize_fts_text(
      token.unsafe_substring(start=1, end=token.length() - 1),
    )
    if inner == "" {
      raise SqlError("Empty quoted phrase in search query")
    }
    return "\"\{inner}\""
  }
  let normalized = normalize_fts_text(token)
  if normalized == "" {
    raise SqlError("Unsupported search token `\{token}`")
  }
  if needs_fts_quotes(normalized) {
    "\"\{normalized}\""
  } else if normalized.has_suffix("*") {
    normalized
  } else {
    normalized + "*"
  }
}

///|
/// Compiles the value of a single-column search: like `compile_fts_value`
/// but quotes are not special. `label` names the column in the error for a
/// blank value.
pub fn compile_literal_field_value(
  input : String,
  label : String,
) -> String raise SqlError {
  let normalized = normalize_fts_text(@query.trim(input))
  if normalized == "" {
    raise SqlError("Search field `\{label}` is empty")
  }
  if needs_fts_quotes(normalized) {
    "\"\{normalized}\""
  } else if normalized.has_suffix("*") {
    normalized
  } else {
    normalized + "*"
  }
}

///|
/// The FTS5 column searched for a field name or alias of the `q` syntax:
/// `name`/`full_name`, `owner`/`author`, `package`/`pkg`/`package_name`,
/// `keyword`/`keywords`/`tag`/`tags`, `description`/`desc`/`abstract`,
/// ignoring ASCII case.
pub fn map_field_alias(field : String) -> String? {
  match field.to_lower() {
    "name" | "full_name" => Some("full_name")
    "owner" | "author" => Some("owner")
    "package" | "pkg" | "package_name" => Some("package_name")
    "keyword" | "keywords" | "tag" | "tags" => Some("keywords")
    "description" | "desc" | "abstract" => Some("description")
    _ => None
  }
}

///|
fn is_boolean_operator(token : String) -> Bool {
  token.equal_ignore_ascii_case("AND") ||
  token.equal_ignore_ascii_case("OR") ||
  token.equal_ignore_ascii_case("NOT")
}

///|
/// Splits the `q` text into words, parentheses and quoted phrases (quotes
/// kept). White space outside quotes separates words.
fn tokenize_fts_query(input : String) -> Array[String] raise SqlError {
  let tokens : Array[String] = []
  let current = StringBuilder()
  let mut in_quotes = false
  for char in input {
    if char == '"' {
      current.write_char(char)
      in_quotes = !in_quotes
      continue
    }
    if in_quotes {
      current.write_char(char)
      continue
    }
    if @query.is_white_space(char.to_int()) {
      if !current.is_empty() {
        tokens.push(current.to_string())
        current.reset()
      }
      continue
    }
    if char == '(' || char == ')' {
      if !current.is_empty() {
        tokens.push(current.to_string())
        current.reset()
      }
      tokens.push(char.to_string())
      continue
    }
    current.write_char(char)
  }
  if in_quotes {
    raise SqlError("Unclosed quoted phrase in search query")
  }
  if !current.is_empty() {
    tokens.push(current.to_string())
  }
  tokens
}

///|
/// Checks that the tokens form a well-bracketed alternation of operands and
/// boolean operators, so that FTS5 never sees a syntax error.
fn validate_fts_tokens(tokens : Array[String]) -> Unit raise SqlError {
  if tokens.is_empty() {
    raise SqlError("Search query is empty")
  }
  let mut expect_operand = true
  let mut depth = 0
  for token in tokens {
    if token == "(" {
      if !expect_operand {
        raise SqlError("Missing boolean operator before opening parenthesis")
      }
      depth += 1
      continue
    }
    if token == ")" {
      if expect_operand || depth == 0 {
        raise SqlError("Unexpected closing parenthesis in search query")
      }
      depth -= 1
      continue
    }
    if is_boolean_operator(token) {
      let normalized = token.to_upper()
      if normalized == "NOT" {
        expect_operand = true
        continue
      }
      if expect_operand {
        raise SqlError("Search query cannot start with `\{normalized}`")
      }
      expect_operand = true
      continue
    }
    if !expect_operand {
      raise SqlError("Missing boolean operator between search terms")
    }
    expect_operand = false
  }
  if depth != 0 {
    raise SqlError("Unbalanced parentheses in search query")
  }
  if expect_operand {
    raise SqlError("Search query cannot end with a boolean operator")
  }
}

///|
/// `field:value` with a field of `[A-Za-z0-9_-]+` and a non-empty value.
fn split_field_token(token : String) -> (String, String)? {
  guard token.find(":") is Some(index) else { return None }
  if index <= 0 || index == token.length() - 1 {
    return None
  }
  let field = token.unsafe_substring(start=0, end=index)
  for i in 0..<field.length() {
    let code = field.at(i).to_int()
    if !(is_ascii_alnum(code) || code == '_'.to_int() || code == '-'.to_int()) {
      return None
    }
  }
  Some((field, token.unsafe_substring(start=index + 1, end=token.length())))
}

///|
fn compile_global_token(token : String) -> String raise SqlError {
  guard split_field_token(token) is Some((field, raw_value)) else {
    return compile_fts_value(token)
  }
  guard map_field_alias(field) is Some(column) else {
    raise SqlError(
      "Unsupported search field `\{field}`. Use owner, package, keyword, description, or name",
    )
  }
  "\{column} : \{compile_fts_value(raw_value)}"
}

///|
/// Compiles the free-text `q` parameter into an FTS5 MATCH expression.
///
/// The syntax is words, `"phrases"`, `field:value` (see `map_field_alias`),
/// `AND`, `OR`, `NOT` and parentheses. Every error FTS5 could report is
/// caught first and raised as `SqlError`.
pub fn compile_fts_expression(input : String) -> String raise SqlError {
  let tokens = tokenize_fts_query(input)
  validate_fts_tokens(tokens)
  let compiled = []
  for token in tokens {
    if is_boolean_operator(token) || token == "(" || token == ")" {
      compiled.push(token.to_upper())
    } else {
      compiled.push(compile_global_token(token))
    }
  }
  compiled.join(" ")
}

///|
/// `column : value` for a search restricted to one FTS5 column.
pub fn compile_field_expression(
  column : String,
  input : String,
) -> String raise SqlError {
  "\{column} : \{compile_literal_field_value(input, column)}"
}
