# 使用指南

本文覆盖当前 **`0.1.0`** 分支上的本地使用流程。

## 前置条件

- Python 3
- MoonBit 工具链
- 本地 MoonBit registry 快照，默认位于 `~/.moon/registry/index/user`

## 1. 构建数据库

启用 mooncakes 下载量抓取：

```bash
python3 scripts/build_index.py --db data/mooncake.db
```

这个命令会：

- 读取本地 registry 下所有 `*.index` 记录
- 从头重建 SQLite schema
- 在未禁用时抓取 mooncakes 下载量
- 计算依赖边、反向依赖数量和包分数

如果只想依赖本地数据：

```bash
python3 scripts/build_index.py --db data/mooncake.db --skip-mooncakes-downloads
```

如果要叠加本地下载量覆盖文件：

```bash
python3 scripts/build_index.py \
  --db data/mooncake.db \
  --downloads-json data/downloads.json
```

覆盖文件格式是一个以完整包名为键的 JSON 对象：

```json
{
  "owner/package": 1234
}
```

## 2. 启动本地应用

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run dev
```

然后访问 `http://127.0.0.1:3000`。

当前 Next.js 应用会提供：

- `/`：研究型前端界面
- `/api/*`：基于 SQLite 的 JSON API

## 3. 调用 API

搜索：

```text
GET /api/search?q=io&limit=20
```

高级检索参数：

- `q`：全局全文检索，支持 `AND`、`OR`、`NOT`、括号、短语引号，以及
  `owner:`、`author:`、`package:`、`keyword:`、`description:`、`name:` 等字段前缀
- `owner`、`package`、`keyword`、`description`：字段级全文筛选，彼此按 `AND`
  组合
- `license`、`repository`：元数据模糊匹配
- `rank`：`S`、`A`、`B`、`C`、`D`
- `momentum`：`Rising`、`Hot`、`Stable`
- `min_score`、`max_score`
- `min_dependents`、`min_recent_dependents`、`min_downloads`
- `from_year`、`to_year`：按最新版本年份筛选
- `has_repository`、`has_license`：传 `true` 或 `false`
- `sort`：`relevance`、`score`、`growth`、`downloads`、`dependents`、`recent`、`updated`、`name`
- `order`：`asc` 或 `desc`
- `limit`：最大 `100`

字段语义补充：

- `owner` 表示本地 registry 元数据里的包命名空间所有者。
- `author:` 当前只是 `owner:` 的别名，用来兼容更像学术检索的输入习惯。
- 当前索引里还没有独立的作者列表、维护者列表或机构字段，所以 `author:` 还不表示独立作者元数据。

示例：

```text
GET /api/search?q=owner:gmlewis AND "http client"&limit=20
GET /api/search?q=author:gmlewis AND keyword:json
GET /api/search?keyword=json&min_score=180&min_downloads=500&sort=downloads
GET /api/search?description=parser&from_year=2024&to_year=2026&has_repository=true&sort=updated
GET /api/search?rank=A&momentum=Rising&min_dependents=5&sort=growth
```

Feeds：

```text
GET /api/feeds/top?limit=50
GET /api/feeds/hot?limit=24
GET /api/feeds/rising?limit=24
```

包分析：

```text
GET /api/packages/<owner>/<name>/analysis
```

## 4. 校验修改

```bash
moon fmt
moon check --target all
moon test --target all
```

仓库里还提供了这些快捷命令：

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just serve
just dev
./run_test.sh
```

## 说明

- 每次构建索引都会重建整个 SQLite 数据库。
- 下载量可能来自缓存、mooncakes 实时响应，或本地覆盖文件。
- 当 `sort=relevance` 且存在全文条件时，搜索优先按 SQLite `bm25` 相关度排序。
