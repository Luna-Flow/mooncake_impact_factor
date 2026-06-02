#!/usr/bin/env bash
set -euo pipefail

moon check src/cli --target js
moon test src/score --target all
npm test
