///|
priv enum Token {
  LParen
  RParen
  And
  Or
  Not
  /// A quoted string, with escapes resolved.
  Quoted(String)
  /// An operator symbol between a field name and a value.
  Op(Operator)
  /// Any other run of characters: a field name, a bare value or a bare word.
  Word(String)
}

///|
fn code_at(input : String, index : Int) -> Int {
  input.at(index).to_int()
}

///|
/// Splits an expression into tokens. Indices are UTF-16 code units, like the
/// TypeScript implementation this replaces; all delimiters are ASCII, so a
/// surrogate pair is never split from its partner.
fn tokenize(input : String) -> Array[Token] raise QueryError {
  let tokens : Array[Token] = []
  let len = input.length()
  let mut index = 0
  while index < len {
    let code = code_at(input, index)
    if is_white_space(code) {
      index += 1
      continue
    }
    if code == '('.to_int() {
      tokens.push(LParen)
      index += 1
      continue
    }
    if code == ')'.to_int() {
      tokens.push(RParen)
      index += 1
      continue
    }
    if code == ':'.to_int() {
      tokens.push(Op(Match))
      index += 1
      continue
    }
    if code == '='.to_int() {
      tokens.push(Op(Eq))
      index += 1
      continue
    }
    if (code == '>'.to_int() || code == '<'.to_int()) &&
      index + 1 < len &&
      code_at(input, index + 1) == '='.to_int() {
      tokens.push(Op(if code == '>'.to_int() { Gte } else { Lte }))
      index += 2
      continue
    }
    if code == '"'.to_int() {
      // A backslash takes the next code unit literally. The pieces between
      // escapes are copied as substrings.
      let value = StringBuilder()
      index += 1
      let mut segment = index
      let mut closed = false
      while index < len {
        let inner = code_at(input, index)
        if inner == '\\'.to_int() {
          if index + 1 >= len {
            raise QueryError("Unclosed quoted string")
          }
          value.write_substring(input, segment, index - segment)
          segment = index + 1
          index += 2
          continue
        }
        if inner == '"'.to_int() {
          value.write_substring(input, segment, index - segment)
          index += 1
          closed = true
          break
        }
        index += 1
      }
      if !closed {
        raise QueryError("Unclosed quoted string")
      }
      tokens.push(Quoted(value.to_string()))
      continue
    }
    let start = index
    while index < len {
      let inner = code_at(input, index)
      if is_white_space(inner) ||
        inner == '('.to_int() ||
        inner == ')'.to_int() ||
        inner == ':'.to_int() ||
        inner == '='.to_int() {
        break
      }
      if (inner == '>'.to_int() || inner == '<'.to_int()) &&
        index + 1 < len &&
        code_at(input, index + 1) == '='.to_int() {
        break
      }
      index += 1
    }
    let word = input.unsafe_substring(start~, end=index)
    if word.equal_ignore_ascii_case("AND") {
      tokens.push(And)
    } else if word.equal_ignore_ascii_case("OR") {
      tokens.push(Or)
    } else if word.equal_ignore_ascii_case("NOT") {
      tokens.push(Not)
    } else {
      tokens.push(Word(word))
    }
  }
  tokens
}

///|
priv struct Cursor {
  tokens : Array[Token]
  mut index : Int
}

///|
fn Cursor::peek(self : Cursor) -> Token? {
  self.tokens.get(self.index)
}

///|
fn Cursor::consume(self : Cursor) -> Token? {
  let token = self.tokens.get(self.index)
  if token is Some(_) {
    self.index += 1
  }
  token
}

///|
fn Cursor::done(self : Cursor) -> Bool {
  self.index >= self.tokens.length()
}

///|
fn parse_value(cursor : Cursor) -> String raise QueryError {
  match cursor.consume() {
    None => raise QueryError("Missing query value")
    Some(Word(value)) | Some(Quoted(value)) => value
    Some(_) => raise QueryError("Invalid query value")
  }
}

///|
fn coalesce(op : GroupOp, nodes : Array[Node]) -> Node {
  if nodes.length() == 1 {
    nodes[0]
  } else {
    group(op, nodes)
  }
}

///|
fn parse_primary(cursor : Cursor) -> Node raise QueryError {
  match cursor.peek() {
    None => raise QueryError("Unexpected end of query expression")
    Some(LParen) => {
      cursor.index += 1
      let inner = parse_or(cursor)
      match cursor.consume() {
        Some(RParen) => inner
        _ => raise QueryError("Expected rparen")
      }
    }
    Some(Not) => {
      cursor.index += 1
      parse_primary(cursor).toggle_negation()
    }
    Some(Word(word)) => {
      cursor.index += 1
      match cursor.peek() {
        Some(Op(operator)) => {
          cursor.index += 1
          guard Field::from_name(word) is Some(field) else {
            raise QueryError("Unsupported query field `\{word}`")
          }
          let value = parse_value(cursor)
          term(field, operator, value)
        }
        _ => term(Text, Match, word)
      }
    }
    Some(Quoted(value)) => {
      cursor.index += 1
      term(Text, Match, value)
    }
    Some(_) => {
      cursor.index += 1
      raise QueryError("Invalid query term")
    }
  }
}

///|
fn parse_and(cursor : Cursor) -> Node raise QueryError {
  let nodes = [parse_primary(cursor)]
  while cursor.peek() is Some(And) {
    cursor.index += 1
    nodes.push(parse_primary(cursor))
  }
  coalesce(And, nodes)
}

///|
fn parse_or(cursor : Cursor) -> Node raise QueryError {
  let nodes = [parse_and(cursor)]
  while cursor.peek() is Some(Or) {
    cursor.index += 1
    nodes.push(parse_and(cursor))
  }
  coalesce(Or, nodes)
}

///|
/// Parses an expression of the native query language into a query tree.
///
/// ```text
/// (owner:gmlewis OR keyword:json) AND score>=180 AND NOT rank=D
/// ```
///
/// `NOT` binds tightest, then `AND`, then `OR`; parentheses group. A bare
/// word or a quoted string is a `text` match. Keywords are case-insensitive,
/// field names are not. A blank expression gives `empty_ast()`. A result that
/// is a single term is wrapped in an `And` group, so the root is always a
/// group.
pub fn parse_expression(input : String) -> Group raise QueryError {
  let trimmed = trim(input)
  if trimmed == "" {
    return empty_ast()
  }
  let cursor = Cursor::{ tokens: tokenize(trimmed), index: 0, }
  let root = parse_or(cursor)
  if !cursor.done() {
    raise QueryError("Unexpected trailing query tokens")
  }
  match root {
    Group(group) => group
    Term(_) => Group::make(And, [root])
  }
}
