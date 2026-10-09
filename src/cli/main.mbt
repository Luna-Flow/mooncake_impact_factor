///|
#borrow(path)
extern "js" fn read_file_json(path : String) -> String =
  #| (path) => {
  #|   const fs = process.getBuiltinModule("fs");
  #|   try {
  #|     return JSON.stringify(fs.readFileSync(path, "utf8"));
  #|   } catch (_error) {
  #|     return "null";
  #|   }
  #| }

///|
fn read_file(path : String) -> Result[String, String] raise {
  match @json.parse(read_file_json(path)) {
    String(contents) => Ok(contents)
    _ => Err("Failed to read input: " + path)
  }
}

///|
#borrow(path, text)
extern "js" fn write_file(path : String, text : String) -> Unit =
  #| (path, text) => {
  #|   const fs = process.getBuiltinModule("fs");
  #|   fs.writeFileSync(path, text, "utf8");
  #| }

///|
extern "js" fn exit_with_code(code : Int) -> Unit =
  #| (code) => {
  #|   process.exit(code);
  #| }

///|
const USAGE : String = "Usage: cli build-index --input <path> [--output <path>]"

///|
fn fail(message : String) -> Unit {
  println(Json::object({ "error": Json::string(message) }).stringify())
  exit_with_code(1)
}

///|
fn option_value(args : Array[String], name : String) -> String? {
  for i in 0..<(args.length() - 1) {
    if args[i] == name {
      return Some(args[i + 1])
    }
  }
  None
}

///|
/// Reads an `@metrics.Input` from `input_path` and returns the
/// `@metrics.Report` as JSON text.
fn build_index(input_path : String) -> Result[String, String] raise {
  let contents = match read_file(input_path) {
    Ok(contents) => contents
    Err(message) => return Err(message)
  }
  let payload = @json.parse(contents)
  let input : @metrics.Input = @json.from_json(payload)
  Ok(Json(@metrics.compute(input)).stringify())
}

///|
fn main {
  let args = @env.args()
  if args.length() < 3 || args[2] != "build-index" {
    fail(USAGE)
    return
  }
  guard option_value(args, "--input") is Some(input_path) else {
    fail(USAGE)
    return
  }
  let output = build_index(input_path) catch { error => Err(error.to_string()) }
  match output {
    Err(message) => fail(message)
    Ok(output) =>
      match option_value(args, "--output") {
        Some(path) => write_file(path, output)
        None => println(output)
      }
  }
}
