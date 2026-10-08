///|
#deprecated("Use `Json(x)` instead", skip_current_package=true)
#doc(hidden)
pub extend ScoreSnapshot with ToJson::{to_json}

///|
#deprecated("Use `@json.from_json` instead", skip_current_package=true)
#doc(hidden)
pub extend ScoreSnapshot with @json.FromJson::{from_json}

///|
#deprecated("Use `Debug::to_repr` instead", skip_current_package=true)
#doc(hidden)
pub extend ScoreSnapshot with @debug.Debug::{to_repr}
