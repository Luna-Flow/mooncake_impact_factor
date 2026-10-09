///|
/// Whether the UTF-16 code unit `code` is white space in the sense of
/// ECMAScript `String.prototype.trim` and the regular expression class `\s`:
/// the WhiteSpace and LineTerminator code points of ECMA-262. All of them
/// are in the Basic Multilingual Plane, so testing code units is exact.
pub fn is_white_space(code : Int) -> Bool {
  match code {
    0x09 | 0x0A | 0x0B | 0x0C | 0x0D | 0x20 => true
    0xA0 | 0x1680 | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF => true
    _ => code >= 0x2000 && code <= 0x200A
  }
}

///|
/// `input` without leading and trailing white space (see `is_white_space`).
/// It gives the same result as ECMAScript `String.prototype.trim` on every
/// backend.
pub fn trim(input : String) -> String {
  let len = input.length()
  let mut start = 0
  while start < len && is_white_space(input.at(start).to_int()) {
    start += 1
  }
  let mut end = len
  while end > start && is_white_space(input.at(end - 1).to_int()) {
    end -= 1
  }
  if start == 0 && end == len {
    input
  } else {
    input.unsafe_substring(start~, end~)
  }
}

///|
fn digit_value(code : Int, radix : Int) -> Int {
  let value = if code >= '0'.to_int() && code <= '9'.to_int() {
    code - '0'.to_int()
  } else if code >= 'a'.to_int() && code <= 'z'.to_int() {
    code - 'a'.to_int() + 10
  } else if code >= 'A'.to_int() && code <= 'Z'.to_int() {
    code - 'A'.to_int() + 10
  } else {
    radix
  }
  if value < radix {
    value
  } else {
    -1
  }
}

///|
fn not_a_number() -> Double {
  0.0 / 0.0
}

///|
fn positive_infinity() -> Double {
  1.0 / 0.0
}

///|
fn parse_radix_integer(text : String, start : Int, radix : Int) -> Double {
  let len = text.length()
  if start >= len {
    return not_a_number()
  }
  let mut value = 0.0
  for i in start..<len {
    let digit = digit_value(text.at(i).to_int(), radix)
    if digit < 0 {
      return not_a_number()
    }
    value = value * radix.to_double() + digit.to_double()
  }
  value
}

///|
fn is_ascii_digit_code(code : Int) -> Bool {
  code >= '0'.to_int() && code <= '9'.to_int()
}

///|
/// Reads `input` as a number the way ECMAScript `Number(input)` does, so
/// that numeric query values mean the same on every backend:
///
/// - surrounding white space is ignored and a blank string is `0`;
/// - `0x`, `0o` and `0b` prefixes read hexadecimal, octal and binary digits;
/// - `Infinity` with an optional sign is infinite;
/// - otherwise the text must be a decimal literal with an optional sign,
///   fraction and exponent (`12`, `-1.5`, `.5`, `5.`, `1e3`);
/// - anything else is NaN.
///
/// Decimal literals are rounded correctly. Prefixed literals are accumulated
/// in double precision, which is exact below 2^53.
pub fn number_value(input : String) -> Double {
  let text = trim(input)
  let len = text.length()
  if len == 0 {
    return 0.0
  }
  if len > 2 && text.at(0).to_int() == '0'.to_int() {
    let prefix = text.at(1).to_int()
    if prefix == 'x'.to_int() || prefix == 'X'.to_int() {
      return parse_radix_integer(text, 2, 16)
    }
    if prefix == 'o'.to_int() || prefix == 'O'.to_int() {
      return parse_radix_integer(text, 2, 8)
    }
    if prefix == 'b'.to_int() || prefix == 'B'.to_int() {
      return parse_radix_integer(text, 2, 2)
    }
  }
  match text {
    "Infinity" | "+Infinity" => return positive_infinity()
    "-Infinity" => return -positive_infinity()
    _ => ()
  }
  let mut index = 0
  let mut negative = false
  let first = text.at(0).to_int()
  if first == '+'.to_int() || first == '-'.to_int() {
    negative = first == '-'.to_int()
    index = 1
  }
  let int_start = index
  while index < len && is_ascii_digit_code(text.at(index).to_int()) {
    index += 1
  }
  let int_end = index
  let mut frac_start = index
  let mut frac_end = index
  if index < len && text.at(index).to_int() == '.'.to_int() {
    index += 1
    frac_start = index
    while index < len && is_ascii_digit_code(text.at(index).to_int()) {
      index += 1
    }
    frac_end = index
  }
  if int_end == int_start && frac_end == frac_start {
    return not_a_number()
  }
  let mut exponent = ""
  if index < len &&
    (
      text.at(index).to_int() == 'e'.to_int() ||
      text.at(index).to_int() == 'E'.to_int()
    ) {
    index += 1
    let exp_start = index
    if index < len &&
      (
        text.at(index).to_int() == '+'.to_int() ||
        text.at(index).to_int() == '-'.to_int()
      ) {
      index += 1
    }
    let digits_start = index
    while index < len && is_ascii_digit_code(text.at(index).to_int()) {
      index += 1
    }
    if index == digits_start {
      return not_a_number()
    }
    exponent = "e" + text.unsafe_substring(start=exp_start, end=index)
  }
  if index != len {
    return not_a_number()
  }
  let int_part = if int_end > int_start {
    text.unsafe_substring(start=int_start, end=int_end)
  } else {
    "0"
  }
  let frac_part = if frac_end > frac_start {
    "." + text.unsafe_substring(start=frac_start, end=frac_end)
  } else {
    ""
  }
  // The literal is well formed, so the only failure left is overflow.
  let magnitude = @string.parse_double(int_part + frac_part + exponent) catch {
    _ => positive_infinity()
  }
  if negative {
    -magnitude
  } else {
    magnitude
  }
}
