# Luna-Flow/mooncake_impact_factor

このドキュメントは **v0.1.2** の現在ベースラインを追跡します。

## リポジトリの位置付け

mooncakes パッケージの順位付け、スナップショット取り込み、検索分析のツール群です。

## ドキュメント構成

- `README.md` にリポジトリ叙述とリリース基線を書く。
- `doc_standard.md` に文書契約を書く。
- モジュールまたはサブシステム配下に `api.md`、`tutorial.md`、`design.md` を置く。

## モジュール概要

- **`score`**: 主な実装は `src/score` にあります。
- **`cli`**: 主な実装は `src/cli` にあります。
- **`static_search`**: 主な実装は `src/static_search` にあります。

## ドキュメント入口

- API リファレンス: [score](./score/api.md)
- API リファレンス: [cli](./cli/api.md)
- API リファレンス: [static_search](./static_search/api.md)
