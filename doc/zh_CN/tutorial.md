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

## 2. 启动本地服务

```bash
python3 scripts/serve.py --db data/mooncake.db --host 127.0.0.1 --port 8765
```

然后访问 `http://127.0.0.1:8765`。

当前服务会提供：

- `/`：静态 HTML 页面
- `/app.css`：前端样式
- `/app.js`：前端逻辑
- `/api/*`：基于 SQLite 的 JSON API

## 3. 调用 API

搜索：

```text
GET /api/search?q=io&limit=20
```

Top 列表：

```text
GET /api/top?limit=50
```

包详情：

```text
GET /api/packages/<owner>/<name>
```

反向依赖：

```text
GET /api/packages/<owner>/<name>/dependents
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
- 搜索结果按计算分数排序，不是只按全文匹配相关度排序。
