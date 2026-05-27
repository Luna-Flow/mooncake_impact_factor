# 文档标准

仓库文档必须描述**当前分支上的真实实现**。截至 `2026-05-27`，当前文档基线为
**`0.1.0`**。

## 必备文档类型

每种语言的文档至少应覆盖当前对外能力：

1. `README.md` 或语言总览：仓库定位与入口
2. `tutorial.md`：环境准备、索引构建和本地使用流程
3. `api.md`：MoonBit 导出函数或稳定 HTTP 契约
4. `design.md`：评分模型、数据流和实现约束

## 组织规则

- 按语言和子系统组织文档。
- 文档结构应与仓库目录结构保持一致。
- 尽量按稳定职责拆文档，不要把 API、教程、设计说明混成一个长文件。
- 不要记录当前分支里不存在的命令、路由、字段或导出接口。

推荐结构：

```txt
doc/
  en_US/
    README.md
    doc_standard.md
    tutorial.md
    score/
      api.md
      design.md
  zh_CN/
    README.md
    doc_standard.md
    tutorial.md
    score/
      api.md
      design.md
```

## 一致性要求

- `README.md`、`CONTRIBUTING.md` 与 `doc/*` 需要讲述同一条发布线。
- API 文档必须与实际 MoonBit 包名和导出函数一致。
- Python 脚本如果暴露了 CLI 参数、数据库行为或 HTTP API 契约，需要明确记录稳定语义。
- 凡是依赖本地索引快照或 mooncakes 下载数据的结论，都要说明数据来源。
- 如果 Python 与 MoonBit 故意维护同一套评分公式，代码和文档都要同步更新。
