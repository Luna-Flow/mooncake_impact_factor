set positional-arguments

db := "data/mooncake.db"
host := "127.0.0.1"
port := "3000"

default:
  @just --list

refresh-index:
  moon update

build-db:
  just refresh-index
  moon build src/cli --target js
  python3 scripts/build_index.py --db {{db}}

build-db-with-downloads downloads_json:
  just refresh-index
  moon build src/cli --target js
  python3 scripts/build_index.py --db {{db}} --downloads-json {{downloads_json}}

build-db-offline:
  just refresh-index
  moon build src/cli --target js
  python3 scripts/build_index.py --db {{db}} --skip-mooncakes-downloads

serve:
  MOONCAKE_DB_PATH={{db}} npm run start -- --hostname {{host}} --port {{port}}

web-build:
  npm run build

build-static-data:
  just refresh-index
  moon build src/cli --target js
  moon build src/static_search --target js
  python3 scripts/build_index.py --db {{db}}
  python3 scripts/export_static_json.py --db {{db}} --out public/data

static-build:
  npm run build:static

static-serve:
  npm run serve:static

web-typecheck:
  npm run typecheck

check:
  moon check src/score --target all
  moon check src/cli --target js

test:
  moon test src/score --target all
  npm test

fmt:
  moon fmt

dev:
  just refresh-index
  moon build src/cli --target js
  python3 scripts/build_index.py --db {{db}}
  MOONCAKE_DB_PATH={{db}} npm run dev -- --hostname {{host}} --port {{port}}
