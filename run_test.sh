#!/usr/bin/env bash
set -euo pipefail

moon check src/cli --target js
moon test src/score --target all
moon test src/query src/query_sql src/static_search --target all
npm test
