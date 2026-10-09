///|
pub const MILLIS_PER_DAY : Int64 = 86_400_000L

///|
/// Parses an RFC 3339 timestamp such as `2026-09-30T15:52:04.965858+00:00`
/// or `2026-09-30T15:52:04Z` and returns milliseconds since the Unix epoch.
/// Fractions are truncated to milliseconds. Returns `None` for anything
/// else, including out-of-range fields.
pub fn parse_timestamp(text : String) -> Int64? {
  let chars = text.to_array()
  let n = chars.length()
  if n < 19 {
    return None
  }
  let year = digits(chars, 0, 4)
  let month = digits(chars, 5, 2)
  let day = digits(chars, 8, 2)
  let hour = digits(chars, 11, 2)
  let minute = digits(chars, 14, 2)
  let second = digits(chars, 17, 2)
  if chars[4] != '-' ||
    chars[7] != '-' ||
    (chars[10] != 'T' && chars[10] != 't' && chars[10] != ' ') ||
    chars[13] != ':' ||
    chars[16] != ':' {
    return None
  }
  guard (year, month, day, hour, minute, second)
    is (
      Some(year),
      Some(month),
      Some(day),
      Some(hour),
      Some(minute),
      Some(second),
    ) else {
    return None
  }
  if month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days_in_month(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 60 {
    return None
  }
  let mut i = 19
  let mut millis = 0
  if i < n && chars[i] == '.' {
    i = i + 1
    let start = i
    while i < n && chars[i] >= '0' && chars[i] <= '9' {
      if i - start < 3 {
        millis = millis * 10 + (chars[i].to_int() - '0'.to_int())
      }
      i = i + 1
    }
    if i == start {
      return None
    }
    for _ in (i - start)..<3 {
      millis = millis * 10
    }
  }
  guard i < n else { return None }
  let offset_minutes = if chars[i] == 'Z' || chars[i] == 'z' {
    guard i + 1 == n else { return None }
    0
  } else if (chars[i] == '+' || chars[i] == '-') &&
    i + 6 == n &&
    chars[i + 3] == ':' {
    guard (digits(chars, i + 1, 2), digits(chars, i + 4, 2))
      is (Some(oh), Some(om)) &&
      oh <= 23 &&
      om <= 59 else {
      return None
    }
    let total = oh * 60 + om
    if chars[i] == '-' {
      -total
    } else {
      total
    }
  } else {
    return None
  }
  let days = days_from_civil(year, month, day)
  let seconds = days * 86400L +
    (hour * 3600 + minute * 60 + second).to_int64() -
    (offset_minutes * 60).to_int64()
  Some(seconds * 1000L + millis.to_int64())
}

///|
/// Whole days from `earlier` to `later` (both in epoch milliseconds),
/// rounded towards negative infinity.
pub fn days_between(earlier : Int64, later : Int64) -> Int {
  let diff = later - earlier
  let days = diff / MILLIS_PER_DAY
  (if diff % MILLIS_PER_DAY < 0L { days - 1L } else { days }).to_int()
}

///|
fn digits(chars : Array[Char], start : Int, count : Int) -> Int? {
  if start + count > chars.length() {
    return None
  }
  let mut value = 0
  for k in 0..<count {
    let c = chars[start + k]
    if c < '0' || c > '9' {
      return None
    }
    value = value * 10 + (c.to_int() - '0'.to_int())
  }
  Some(value)
}

///|
fn is_leap_year(year : Int) -> Bool {
  (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

///|
fn days_in_month(year : Int, month : Int) -> Int {
  match month {
    2 => if is_leap_year(year) { 29 } else { 28 }
    4 | 6 | 9 | 11 => 30
    _ => 31
  }
}

///|
/// Days since 1970-01-01 of a proleptic Gregorian date (H. Hinnant's
/// `days_from_civil`).
fn days_from_civil(year : Int, month : Int, day : Int) -> Int64 {
  let y = (if month <= 2 { year - 1 } else { year }).to_int64()
  let era = (if y >= 0L { y } else { y - 399L }) / 400L
  let yoe = y - era * 400L
  let m = month.to_int64()
  let doy = (153L * (if m > 2L { m - 3L } else { m + 9L }) + 2L) / 5L +
    day.to_int64() -
    1L
  let doe = yoe * 365L + yoe / 4L - yoe / 100L + doy
  era * 146097L + doe - 719468L
}

///|
/// Formats epoch milliseconds as `YYYY-MM-DDTHH:MM:SS.mmmZ` (UTC).
pub fn format_timestamp(millis : Int64) -> String {
  let days = floor_div(millis, MILLIS_PER_DAY)
  let rest = (millis - days * MILLIS_PER_DAY).to_int()
  let (year, month, day) = civil_from_days(days)
  let hour = rest / 3_600_000
  let minute = rest / 60_000 % 60
  let second = rest / 1000 % 60
  let ms = rest % 1000
  "\{pad(year, 4)}-\{pad(month, 2)}-\{pad(day, 2)}T\{pad(hour, 2)}:\{pad(minute, 2)}:\{pad(second, 2)}.\{pad(ms, 3)}Z"
}

///|
fn floor_div(a : Int64, b : Int64) -> Int64 {
  let q = a / b
  if a % b < 0L {
    q - 1L
  } else {
    q
  }
}

///|
fn pad(value : Int, width : Int) -> String {
  let text = value.to_string()
  let buf = StringBuilder()
  for _ in text.length()..<width {
    buf.write_char('0')
  }
  buf.write_string(text)
  buf.to_string()
}

///|
/// The proleptic Gregorian date of a day count since 1970-01-01 (H. Hinnant's
/// `civil_from_days`).
fn civil_from_days(days : Int64) -> (Int, Int, Int) {
  let z = days + 719468L
  let era = (if z >= 0L { z } else { z - 146096L }) / 146097L
  let doe = z - era * 146097L
  let yoe = (doe - doe / 1460L + doe / 36524L - doe / 146096L) / 365L
  let y = yoe + era * 400L
  let doy = doe - (365L * yoe + yoe / 4L - yoe / 100L)
  let mp = (5L * doy + 2L) / 153L
  let d = doy - (153L * mp + 2L) / 5L + 1L
  let m = if mp < 10L { mp + 3L } else { mp - 9L }
  ((if m <= 2L { y + 1L } else { y }).to_int(), m.to_int(), d.to_int())
}
