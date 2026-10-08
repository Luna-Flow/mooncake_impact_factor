# static_search API

The package `Luna-Flow/mooncake-impact-factor/static_search` holds the MoonBit
side of the static publishing mode: a version tag for the static search
runtime and the text normalisation used to make search case-insensitive. It
builds only for the JavaScript target and is also linked as an ES module that
JavaScript code can import.

Source: [`src/static_search/search.mbt`](../../../src/static_search/search.mbt).
The search index and the query algorithm that run in the browser are
described in the [static_search design](../design/static_search.md).

Import the package in `moon.pkg`; the importing package must build for the
JavaScript target as well:

```text
import {
  "Luna-Flow/mooncake-impact-factor/static_search",
}

supported_targets = "js"
```

## `runtime_version`

`runtime_version` returns the version tag of the static search runtime.

```mbti
pub fn runtime_version() -> String
```

The current tag is `"static-search-js-v1"`. JavaScript code that loads the
compiled module can read it to tell which runtime it got.

```moonbit
test "runtime_version" {
  inspect(@static_search.runtime_version(), content="static-search-js-v1")
}
```

## `normalize_text`

`normalize_text` returns `input` converted to lower case.

```mbti
pub fn normalize_text(String) -> String
```

The conversion is JavaScript's `String.prototype.toLowerCase`: the Unicode
default lower-case mapping, independent of the user's locale. It may change
the length of the string (`"İ"` becomes `"i̇"`, two UTF-16 code units). It
does not trim or collapse white space and does not remove accents.

```moonbit
test "normalize_text" {
  inspect(@static_search.normalize_text("MoonBit JSON"), content="moonbit json")
  inspect(@static_search.normalize_text("  Mixed Case "), content="  mixed case ")
}
```

## JavaScript module

`moon build src/static_search --target js` also writes an ES module, because
the package's `moon.pkg` links it with

```text
options(
  link: {
    "js": {
      "exports": [ "runtime_version", "normalize_text" ],
      "format": "esm",
    },
  },
)
```

The module exports two functions under their MoonBit names:

| Export | JavaScript signature |
| --- | --- |
| `runtime_version` | `() => string` |
| `normalize_text` | `(input: string) => string` |

```js
import { runtime_version, normalize_text } from
  "./_build/js/debug/build/static_search/static_search.js";

runtime_version();             // "static-search-js-v1"
normalize_text("Json Parser"); // "json parser"
```

> [!NOTE]
> In this release the browser search worker
> (`frontend/src/static-search.worker.ts`) normalises text in TypeScript and
> does not import this module; the static site build compiles it to keep it
> in step with the MoonBit sources.
