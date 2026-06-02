# Mooncake Impact Factor

当前 **`0.1.1`** 基线的中文文档入口。

## 文档目录

- [文档标准](./doc_standard.md)
- [使用教程](./tutorial.md)
- [评分 API](./score/api.md)
- [评分设计](./score/design.md)

## 覆盖范围

这套文档描述的是仓库里已经实现的内容：

- `src/score` 中的 MoonBit 评分核心
- `scripts/build_index.py` 中的 SQLite 索引构建流程
- `app/api` 中的 Next.js Route Handler API
- `app` 和 `frontend/src` 中的浏览器界面与共享前端逻辑

## 说明

- 排名来自本地 MoonBit 注册表快照，不是 mooncakes 生态的全局权威榜单。
- 下载量可能来自在线 mooncakes 响应、本地缓存文件，或本地覆盖 JSON 文件。
