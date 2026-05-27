set positional-arguments

db := "data/mooncake.db"
host := "127.0.0.1"
port := "8765"

default:
  @just --list

refresh-index:
  moon update

build-db:
  just refresh-index
  python3 scripts/build_index.py --db {{db}}

build-db-with-downloads downloads_json:
  just refresh-index
  python3 scripts/build_index.py --db {{db}} --downloads-json {{downloads_json}}

build-db-offline:
  just refresh-index
  python3 scripts/build_index.py --db {{db}} --skip-mooncakes-downloads

serve:
  python3 scripts/serve.py --db {{db}} --host {{host}} --port {{port}}

check:
  moon check --target all

test:
  moon test --target all

fmt:
  moon fmt

dev:
  just refresh-index
  python3 scripts/build_index.py --db {{db}}
  python3 scripts/serve.py --db {{db}} --host {{host}} --port {{port}}
