///|
test "runtime version" {
  inspect(@static_search.runtime_version(), content="static-search-v2")
}

///|
test "normalize_text lowers covered scripts on every backend" {
  inspect(
    @static_search.normalize_text("MoonBit JSON"),
    content=(
      #|moonbit json
    ),
  )
  inspect(
    @static_search.normalize_text("  Mixed Case "),
    content=(
      #|  mixed case 
    ),
  )
  inspect(
    @static_search.normalize_text("ÀÉÎÕÜ Ÿ Ł ĹŽ"),
    content=(
      #|àéîõü ÿ ł ĺž
    ),
  )
  inspect(
    @static_search.normalize_text("ΆΣΩ ЁЖЯ Ѣ ＭＯＯＮ"),
    content=(
      #|άσω ёжя ѣ ｍｏｏｎ
    ),
  )
  inspect(
    @static_search.normalize_text("İ ß 原来 🐫 Ǆ"),
    content=(
      #|i̇ ß 原来 🐫 Ǆ
    ),
  )
  inspect(
    @static_search.normalize_text("already lower"),
    content=(
      #|already lower
    ),
  )
}

///|
test "collate follows the CLDR order for ASCII" {
  let names = [
    "b", "B", "a", "A", "ab", "aB", "Ab", "a-b", "a_b", "a/b", "a.b", "ab-", "a b",
    "a!", "a1", "a10", "a2", "Luna-Flow/x", "luna/x", "illusory0x0/🐫", "illusory0x0/a",
    "CAIMEOX/原来", "caimeox/zz", "é", "e", "f",
  ]
  names.sort_by(@static_search.collate)
  debug_inspect(
    names,
    content=(
      #|[
      #|  "a",
      #|  "A",
      #|  "a b",
      #|  "a_b",
      #|  "a-b",
      #|  "a!",
      #|  "a.b",
      #|  "a/b",
      #|  "a1",
      #|  "a10",
      #|  "a2",
      #|  "ab",
      #|  "aB",
      #|  "Ab",
      #|  "ab-",
      #|  "b",
      #|  "B",
      #|  "caimeox/zz",
      #|  "CAIMEOX/原来",
      #|  "e",
      #|  "é",
      #|  "f",
      #|  "illusory0x0/🐫",
      #|  "illusory0x0/a",
      #|  "Luna-Flow/x",
      #|  "luna/x",
      #|]
    ),
  )
  inspect(@static_search.collate("x", "x"), content="0")
  inspect(@static_search.collate("x", "x\u{1}"), content="-1")
}
