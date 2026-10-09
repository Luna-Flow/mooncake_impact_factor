///|
/// Error raised when an expression does not parse or a JSON value is not a
/// valid query tree. The payload is the message shown to the user.
pub suberror QueryError {
  QueryError(String)
} derive(Eq, Debug)

///|
/// The message carried by the error.
pub fn QueryError::message(self : QueryError) -> String {
  match self {
    QueryError(message) => message
  }
}
