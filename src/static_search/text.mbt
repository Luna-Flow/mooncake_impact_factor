///|
/// Lower-case form of one UTF-16 code unit, or `-1` when the code unit has
/// none in the covered blocks.
fn lower_code(code : Int) -> Int {
  if code < 0x80 {
    return if code >= 0x41 && code <= 0x5A { code + 32 } else { -1 }
  }
  // Latin-1 Supplement
  if code >= 0xC0 && code <= 0xDE && code != 0xD7 {
    return code + 32
  }
  // Latin Extended-A
  if code >= 0x100 && code <= 0x17F {
    if (code <= 0x12F || (code >= 0x132 && code <= 0x137)) && code % 2 == 0 {
      return code + 1
    }
    if code >= 0x139 && code <= 0x148 && code % 2 == 1 {
      return code + 1
    }
    if code >= 0x14A && code <= 0x177 && code % 2 == 0 {
      return code + 1
    }
    if code == 0x178 {
      return 0xFF
    }
    if code >= 0x179 && code <= 0x17E && code % 2 == 1 {
      return code + 1
    }
    return -1
  }
  // Greek and Coptic
  if code >= 0x370 && code <= 0x3FF {
    return match code {
      0x370 | 0x372 | 0x376 => code + 1
      0x37F => 0x3F3
      0x386 => 0x3AC
      0x388 | 0x389 | 0x38A => code + 37
      0x38C => 0x3CC
      0x38E | 0x38F => code + 63
      0x3A2 => -1
      0x3CF => 0x3D7
      0x3F4 => 0x3B8
      0x3F7 | 0x3FA => code + 1
      0x3F9 => 0x3F2
      0x3FD | 0x3FE | 0x3FF => code - 130
      _ =>
        if code >= 0x391 && code <= 0x3AB {
          code + 32
        } else if code >= 0x3D8 && code <= 0x3EF && code % 2 == 0 {
          code + 1
        } else {
          -1
        }
    }
  }
  // Cyrillic
  if code >= 0x400 && code <= 0x52F {
    if code <= 0x40F {
      return code + 80
    }
    if code <= 0x42F {
      return code + 32
    }
    if code >= 0x460 && code <= 0x481 && code % 2 == 0 {
      return code + 1
    }
    if code >= 0x48A && code <= 0x4BF && code % 2 == 0 {
      return code + 1
    }
    if code == 0x4C0 {
      return 0x4CF
    }
    if code >= 0x4C1 && code <= 0x4CE && code % 2 == 1 {
      return code + 1
    }
    if code >= 0x4D0 && code % 2 == 0 {
      return code + 1
    }
    return -1
  }
  // Fullwidth Latin capitals
  if code >= 0xFF21 && code <= 0xFF3A {
    return code + 32
  }
  -1
}

///|
/// `input` in lower case, computed by this package rather than by the host,
/// so that every backend gives the same result.
///
/// The mapping is ECMAScript `toLowerCase` restricted to ASCII, Latin-1,
/// Latin Extended-A, Greek and Coptic, Cyrillic (U+0400 to U+052F) and the
/// fullwidth Latin capitals, except that `Σ` always becomes `σ` (ECMAScript
/// picks `ς` at the end of a word). As in ECMAScript, `İ` becomes `i`
/// followed by U+0307. Other characters, including those of other cased scripts, are kept.
/// The static index is exported in lower case already, so this only has to
/// cover what users type.
pub fn normalize_text(input : String) -> String {
  let len = input.length()
  let mut first = 0
  while first < len {
    let code = input.at(first).to_int()
    if code == 0x130 || lower_code(code) >= 0 {
      break
    }
    first += 1
  }
  if first == len {
    return input
  }
  // Unchanged runs are copied whole, so surrogate pairs stay together.
  let builder = StringBuilder()
  let mut segment = 0
  for i in first..<len {
    let code = input.at(i).to_int()
    let replacement = if code == 0x130 {
      "i\u{307}"
    } else {
      let lower = lower_code(code)
      if lower < 0 {
        continue
      }
      lower.unsafe_to_char().to_string()
    }
    builder.write_substring(input, segment, i - segment)
    builder.write_string(replacement)
    segment = i + 1
  }
  builder.write_substring(input, segment, len - segment)
  builder.to_string()
}

///|
/// Punctuation and symbols of ASCII in the order of the CLDR root collation
/// (after the white space characters, before the digits).
let ascii_punctuation_order = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"

///|
/// Primary, secondary and tertiary weight of one code point; `None` for
/// characters the collation ignores (ASCII control characters).
fn collation_weights(char : Char) -> (Int, Int, Int)? {
  let code = char.to_int()
  if code >= 0x09 && code <= 0x0D {
    return Some((code - 0x08, 0, 0))
  }
  if code == 0x20 {
    return Some((6, 0, 0))
  }
  if code < 0x20 || code == 0x7F {
    return None
  }
  if code >= '0'.to_int() && code <= '9'.to_int() {
    return Some((2_000_000 + code - '0'.to_int(), 0, 0))
  }
  if code >= 'a'.to_int() && code <= 'z'.to_int() {
    return Some((2_000_100 + code - 'a'.to_int(), 0, 0))
  }
  if code >= 'A'.to_int() && code <= 'Z'.to_int() {
    return Some((2_000_100 + code - 'A'.to_int(), 0, 1))
  }
  if code < 0x80 {
    match ascii_punctuation_order.find(char.to_string()) {
      Some(index) => return Some((10 + index, 0, 0))
      None => return Some((10 + code, 0, 0))
    }
  }
  // Latin-1 letters with diacritics sort with their base letter.
  if code == 0xFF {
    return Some((2_000_100 + 'y'.to_int() - 'a'.to_int(), code, 0))
  }
  if code >= 0xC0 && code <= 0xFE && code != 0xD7 && code != 0xF7 {
    let base = "aaaaaa-ceeeeiiii-nooooo-ouuuuy--"
    let folded = (code & 0xDF) - 0xC0
    let letter = base.at(folded).to_int()
    if letter >= 'a'.to_int() && letter <= 'z'.to_int() {
      let upper = if code < 0xE0 && code != 0xDF { 1 } else { 0 }
      return Some((2_000_100 + letter - 'a'.to_int(), code, upper))
    }
  }
  // Punctuation and symbols, emoji included, sort before the digits.
  let symbol = (code >= 0xA0 && code <= 0xBF) ||
    code == 0xD7 ||
    code == 0xF7 ||
    (code >= 0x2000 && code <= 0x2BFF) ||
    (code >= 0x3000 && code <= 0x303F) ||
    (code >= 0xFE30 && code <= 0xFE4F) ||
    (code >= 0xFF01 && code <= 0xFF0F) ||
    (code >= 0x1F000 && code <= 0x1FAFF)
  if symbol {
    return Some((1_000 + code, 0, 0))
  }
  // Letters of other scripts and ideographs sort after Latin.
  Some((3_000_000 + code, 0, 0))
}

///|
fn collation_key(text : String) -> Array[(Int, Int, Int)] {
  let key = []
  for char in text {
    if collation_weights(char) is Some(weights) {
      key.push(weights)
    }
  }
  key
}

///|
fn compare_level(
  left : Array[(Int, Int, Int)],
  right : Array[(Int, Int, Int)],
  level : Int,
) -> Int {
  let common = if left.length() < right.length() {
    left.length()
  } else {
    right.length()
  }
  for i in 0..<common {
    let (a, b) = match level {
      0 => (left[i].0, right[i].0)
      1 => (left[i].1, right[i].1)
      _ => (left[i].2, right[i].2)
    }
    if a != b {
      return if a < b { -1 } else { 1 }
    }
  }
  if level == 0 && left.length() != right.length() {
    return if left.length() < right.length() { -1 } else { 1 }
  }
  0
}

///|
fn compare_code_units(left : String, right : String) -> Int {
  let common = if left.length() < right.length() {
    left.length()
  } else {
    right.length()
  }
  for i in 0..<common {
    let a = left.at(i).to_int()
    let b = right.at(i).to_int()
    if a != b {
      return if a < b { -1 } else { 1 }
    }
  }
  if left.length() == right.length() {
    0
  } else if left.length() < right.length() {
    -1
  } else {
    1
  }
}

///|
/// Compares package names for display order: negative when `left` sorts
/// first, `0` only for identical strings.
///
/// For ASCII the order is that of the CLDR root collation, which is what
/// `localeCompare` gives in an English browser: white space, then
/// punctuation in CLDR order, then digits, then letters with case ignored;
/// ties are broken by accents, then by case with lower case first, and
/// finally by UTF-16 code units. Outside ASCII it approximates CLDR:
/// Latin-1 letters sort with their base letter, punctuation, symbols and
/// emoji before the digits, and other scripts after Latin by code point.
pub fn collate(left : String, right : String) -> Int {
  if left == right {
    return 0
  }
  let left_key = collation_key(left)
  let right_key = collation_key(right)
  for level in 0..<3 {
    let order = compare_level(left_key, right_key, level)
    if order != 0 {
      return order
    }
  }
  compare_code_units(left, right)
}
