///|
extern "js" fn read_file(path : String) -> String =
  #| (path) => {
  #|   const fs = process.getBuiltinModule("fs");
  #|   return fs.readFileSync(path, "utf8");
  #| }

///|
extern "js" fn exit_with_code(code : Int) -> Unit =
  #| (code) => {
  #|   process.exit(code);
  #| }

///|
fn load_payload(path : String) -> Json? {
  let text = read_file(path)
  try @json.parse(text) catch {
    _ => None
  } noraise {
    payload => Some(payload)
  }
}

///|
fn emit(result : Json) -> Unit {
  println(result.stringify())
}

///|
fn handle_score_snapshot(payload : Json) -> Json {
  let result = @score.compute_score_snapshot(
    json_number(payload, "dependents"),
    json_number(payload, "recent_dependents"),
    json_number(payload, "downloads"),
    json_number(payload, "days_since_release"),
    json_number(payload, "historical_dependents"),
    json_number(payload, "historical_recent_dependents"),
    json_number(payload, "historical_downloads"),
    json_number(payload, "historical_days_since_release"),
  )
  result.to_json()
}

///|
fn json_number(payload : Json, key : String) -> Int {
  guard payload is Object(map) else { return 0 }
  match map.get(key) {
    Some(Number(number, ..)) => number.to_int()
    _ => 0
  }
}

///|
fn find_input_path(args : Array[String]) -> String? {
  let mut index = 0
  while index < args.length() {
    if args[index] == "--input" && index + 1 < args.length() {
      return Some(args[index + 1])
    }
    index = index + 1
  }
  None
}

///|
fn main {
  let args = @env.args()
  if args.length() < 3 || args[2] != "score-snapshot" {
    println("{\"error\":\"Usage: score-snapshot --input <path>\"}")
    exit_with_code(1)
    return
  }
  match find_input_path(args) {
    Some(path) =>
      match load_payload(path) {
        Some(payload) => emit(handle_score_snapshot(payload))
        None => {
          println("{\"error\":\"Failed to parse JSON input\"}")
          exit_with_code(1)
        }
      }
    None => {
      println("{\"error\":\"Missing --input <path>\"}")
      exit_with_code(1)
    }
  }
}
