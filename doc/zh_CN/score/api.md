# 评分 API

## 包

`Luna-Flow/mooncake-impact-factor/score`

## 导出的 MoonBit 函数

### `clamp_non_negative(value : Int) -> Int`

把负数截断为 `0`，其余整数原样返回。

当前用途：

- 在进入对数计算前兜底非负输入
- 作为与 Python 评分逻辑对齐的基础辅助函数

### `compute_score(dependents : Int, recent_dependents : Int, downloads : Int, days_since_release : Int) -> Double`

根据总被依赖数、近期新增依赖、可选下载量快照和发布时间活跃度计算包影响分。

当前公式：

```text
(ln(dependents + 1) * 38
 + ln(recent_dependents + 1) * 27
 + ln(downloads + 1) * 22)
* activity_multiplier(days_since_release)
```

参数语义：

- `dependents`：总反向依赖包数
- `recent_dependents`：近期窗口内首次出现的反向依赖数
- `downloads`：非负下载量快照
- `days_since_release`：距离最新版本发布时间的天数

行为说明：

- 负数输入会先被截断为 `0`
- 返回值是原始浮点分数
- 当前 MoonBit 实现故意与 Python 构建脚本保持同一公式

### `rank_label(score : Double) -> String`

把分数映射到 `S`、`A`、`B`、`C`、`D` 五档。

当前阈值：

- `S`：`score >= 260.0`
- `A`：`score >= 180.0`
- `B`：`score >= 110.0`
- `C`：`score >= 50.0`
- `D`：其余情况

### `compute_momentum_label(score : Double, score_30d_ago : Double, growth_ratio : Double, recent_dependents : Int) -> String`

把分数增长画像映射到 `Rising`、`Hot`、`Stable`。

### `compute_score_snapshot(...) -> ScoreSnapshot`

一次性返回当前分数快照、历史比较字段、等级标签、动量标签和活跃度乘数。

## 稳定 HTTP 接口

### `GET /api/feeds/top?limit=<n>`

返回按当前分数排序的头部包列表。

### `GET /api/feeds/hot?limit=<n>`

返回当前 `Hot` 动量表现最强的包列表。

### `GET /api/feeds/rising?limit=<n>`

返回当前 `Rising` 动量表现最强的包列表。

### `GET /api/search?...`

返回 `{ "items": [...] }` 形式的包摘要列表。

稳定查询参数：

- `q`
- `limit`
- `owner`
- `package`
- `keyword`
- `description`
- `license`
- `repository`
- `rank`
- `momentum`
- `min_score`
- `max_score`
- `min_dependents`
- `min_recent_dependents`
- `min_downloads`
- `from_year`
- `to_year`
- `has_repository`
- `has_license`
- `sort`
- `order`

### `GET /api/packages/<owner>/<packageName>/analysis`

返回单个包的 `{ "detail": ..., "dependents": [...] }` 分析结果。
