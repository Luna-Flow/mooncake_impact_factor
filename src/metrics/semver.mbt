///|
/// Compares two version strings by Semantic Versioning 2.0.0 precedence:
/// the numeric core `MAJOR.MINOR.PATCH` first, then a release ranks above
/// any of its pre-releases, and pre-release identifiers compare one by one
/// (numeric ones numerically and below alphanumeric ones, which compare in
/// ASCII order; a shorter list ranks lower when it is a prefix). Build
/// metadata after `+` is ignored. A core component that is missing or not
/// a number counts as `0`, so malformed versions still order totally.
pub fn compare_versions(a : String, b : String) -> Int {
  let (core_a, pre_a) = split_version(a)
  let (core_b, pre_b) = split_version(b)
  for k in 0..<3 {
    let c = compare_numeric(core_part(core_a, k), core_part(core_b, k))
    if c != 0 {
      return c
    }
  }
  match (pre_a, pre_b) {
    (None, None) => 0
    (None, Some(_)) => 1
    (Some(_), None) => -1
    (Some(x), Some(y)) => compare_prerelease(x, y)
  }
}

///|
fn split_version(version : String) -> (Array[String], Array[String]?) {
  let without_build = match version.find("+") {
    Some(i) => version.view(end_offset=i).to_owned()
    None => version
  }
  match without_build.find("-") {
    Some(i) => {
      let core = without_build.view(end_offset=i).to_owned()
      let pre = without_build.view(start_offset=i + 1).to_owned()
      (split_dots(core), Some(split_dots(pre)))
    }
    None => (split_dots(without_build), None)
  }
}

///|
fn split_dots(text : String) -> Array[String] {
  text.split(".").map(part => part.to_owned()).to_array()
}

///|
fn core_part(parts : Array[String], k : Int) -> String {
  if k < parts.length() && is_numeric(parts[k]) {
    parts[k]
  } else {
    "0"
  }
}

///|
fn is_numeric(text : String) -> Bool {
  if text.is_empty() {
    return false
  }
  for c in text {
    if c < '0' || c > '9' {
      return false
    }
  }
  true
}

///|
/// Compares two strings of decimal digits by value, without overflow.
fn compare_numeric(a : String, b : String) -> Int {
  let x = strip_leading_zeros(a)
  let y = strip_leading_zeros(b)
  if x.length() != y.length() {
    return if x.length() < y.length() { -1 } else { 1 }
  }
  compare_text(x, y)
}

///|
fn strip_leading_zeros(text : String) -> String {
  let chars = text.to_array()
  let mut i = 0
  while i < chars.length() - 1 && chars[i] == '0' {
    i = i + 1
  }
  String::from_array(chars[i:])
}

///|
fn compare_prerelease(a : Array[String], b : Array[String]) -> Int {
  let n = if a.length() < b.length() { a.length() } else { b.length() }
  for k in 0..<n {
    let x = a[k]
    let y = b[k]
    let c = match (is_numeric(x), is_numeric(y)) {
      (true, true) => compare_numeric(x, y)
      (true, false) => -1
      (false, true) => 1
      (false, false) => compare_text(x, y)
    }
    if c != 0 {
      return c
    }
  }
  a.length().compare(b.length())
}
