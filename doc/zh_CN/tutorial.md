# 使用教程

这份文档覆盖当前 **`0.1.1`** 分支的本地工作流。

## 前置条件

- Python 3
- MoonBit 工具链
- Node.js 和 npm
- `~/.moon/registry/index/user` 下的本地 MoonBit 注册表快照

## 1. 构建数据库

启用 mooncakes 下载量抓取：

```bash
python3 scripts/build_index.py --db data/mooncake.db
```

这个命令会：

- 读取本地注册表下的所有 `*.index` 记录
- 从头重建 SQLite schema
- 在未禁用时从 mooncakes 拉取缺失的下载量
- 计算包边、反向依赖数量、评分快照和全文检索索引

不访问 mooncakes、离线构建：

```bash
python3 scripts/build_index.py --db data/mooncake.db --skip-mooncakes-downloads
```

叠加本地下载量覆盖文件：

```bash
python3 scripts/build_index.py \
  --db data/mooncake.db \
  --downloads-json data/downloads.json
```

覆盖文件必须是一个以完整包名为键的 JSON 对象：

```json
{
  "owner/package": 1234
}
```

## 2. 运行本地应用

先安装依赖：

```bash
npm install
```

启动 Next.js 全栈应用：

```bash
MOONCAKE_DB_PATH=data/mooncake.db npm run dev -- --hostname 127.0.0.1 --port 3000
```

然后打开 `http://127.0.0.1:3000`。

当前应用提供：

- `/`：包榜单浏览界面
- `/search`：主搜索结果页
- `/advanced-search`：参数化高级搜索页
- `/api/*`：直接读取 SQLite 的 JSON API

## 3. 调用 API

搜索：

```text
GET /api/search?q=io&limit=20
```

支持的搜索参数：

- `q`：全局全文检索，支持 `AND`、`OR`、`NOT`、括号、引号短语，以及 `owner:`、`author:`、`package:`、`keyword:`、`description:`、`name:` 等字段前缀
- `owner`、`package`、`keyword`、`description`：字段级全文检索，彼此按 `AND` 组合
- `license`、`repository`：元数据子串过滤
- `rank`：`S`、`A`、`B`、`C`、`D`
- `momentum`：`Rising`、`Hot`、`Stable`
- `min_score`、`max_score`
- `min_dependents`、`min_recent_dependents`、`min_downloads`
- `from_year`、`to_year`
- `has_repository`、`has_license`：`true` 或 `false`
- `sort`：`relevance`、`score`、`growth`、`downloads`、`dependents`、`recent`、`updated`、`name`
- `order`：`asc` 或 `desc`
- `limit`：最大 `100`

字段语义：

- `owner` 表示本地注册表元数据里的包命名空间所有者。
- `author:` 目前只是 `owner:` 的别名。
- 当前索引还没有单独的作者列表、维护者列表或机构字段。

示例：

```text
GET /api/search?q=owner:gmlewis AND "http client"&limit=20
GET /api/search?q=author:gmlewis AND keyword:json
GET /api/search?keyword=json&min_score=180&min_downloads=500&sort=downloads
GET /api/search?description=parser&from_year=2024&to_year=2026&has_repository=true&sort=updated
GET /api/search?rank=A&momentum=Rising&min_dependents=5&sort=growth
```

榜单：

```text
GET /api/feeds/top?limit=50
GET /api/feeds/hot?limit=24
GET /api/feeds/rising?limit=24
```

包分析：

```text
GET /api/packages/<owner>/<packageName>/analysis
```

## 4. 验证改动

```bash
moon fmt
moon check src/score --target all
moon check src/cli --target js
moon test src/score --target all
npm run typecheck
npm run build
```

仓库快捷命令：

```bash
just build-db
just build-db-with-downloads data/downloads.json
just build-db-offline
just web-typecheck
just web-build
just serve
just dev
```

## 备注

- 每次构建索引都会从头重建 SQLite 数据库。
- 下载量可能来自在线 mooncakes 响应、`data/download_cache.json` 或本地覆盖文件。
- 当 `sort=relevance` 且存在任意全文条件时，搜索结果会优先按 SQLite `bm25` 相关性排序。
