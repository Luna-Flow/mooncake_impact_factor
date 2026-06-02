# 文档标准

当前仓库的文档必须描述**分支上的真实实现**。当前基线是 **`0.1.2`**。

## 必需的文档类型

每种语言的文档都应该覆盖当前稳定的用户侧内容：

1. `README.md`：仓库用途、快速开始和文档入口
2. `tutorial.md`：本地环境、索引构建流程和运行方式
3. `score/api.md`：导出的 MoonBit 函数和稳定 HTTP 契约
4. `score/design.md`：评分模型、数据流和实现约束

## 组织规则

- 按语言和子系统组织文档。
- 文档树要和仓库布局对应。
- 优先按稳定关注点拆分文档，不要把教程、API 和设计说明混成一篇长文。
- 不要记录尚未发布的命令、路由、字段或 MoonBit 导出。
- 只要行为依赖本地快照或本地数据库状态，就要明确写出来，避免写成全局服务承诺。

推荐结构：

```txt
README.md
CONTRIBUTING.md
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

## 一致性规则

- `README.md`、`CONTRIBUTING.md` 和 `doc/*` 必须讲同一个版本故事。
- API 文档必须匹配真实的 MoonBit 包名、函数签名和 Next.js 路由契约。
- 如果 Python 脚本暴露了稳定 CLI 参数、数据库行为或搜索语义，要明确写出来。
- 要区分“本地注册表事实”和“mooncakes 权威事实”。
- 如果 Python 和 MoonBit 有意共享评分公式，文档和代码都要同步维护。
