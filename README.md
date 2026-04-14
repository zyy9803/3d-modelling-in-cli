# 3DModel

本项目的标准包管理器是 `pnpm`，开发入口需要同时兼容 Windows 和 macOS。

## Requirements

- Node.js 22+
- `pnpm` 10.33.0
- Python 3

## Commands

- 安装依赖：`pnpm install`
- 启动开发环境：`pnpm dev`
- 运行测试：`pnpm test`
- 构建项目：`pnpm build`

## Notes

- `pnpm dev` 会先自动清理常见残留端口，再同时启动前端和服务端。
- 平台差异命令统一收敛在 TypeScript 脚本里处理，不需要手工执行 PowerShell 或 bash 专属命令。
