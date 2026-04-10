# 第三阶段后半段：Codex 修改 Mesh 并生成新模型设计

## 概述

本文档定义 STL Web 预览器第三阶段后半段的设计：允许 Codex 基于当前选区与视角上下文，实际修改三角网格，并生成新的 STL 模型。

本阶段采用“方案 2”：

- Codex 作为精通 3D 建模与三角网格编辑的专家
- Codex 不直接覆盖原始 STL
- Codex 在 server 分配的 job 工作目录中生成并执行 Python 脚本
- 脚本读取输入模型并产出新的 STL
- server 校验新模型后注册为新的模型版本
- 前端自动切换到新模型，但会话继续保留

## 目标

- 移除当前仅允许对话、不允许实际修改模型的限制
- 为每次编辑请求建立独立的 job 工作目录
- 将 `selectionContext`、`viewContext`、当前模型路径和输出模型路径一起提供给 Codex
- 允许 Codex 通过 Python 脚本实际修改 mesh
- 每次修改都生成新的 STL，不覆盖原模型
- server 在成功后为新模型分配新的 `modelId`
- 前端自动加载新模型，并保持会话连续

## 非目标

- 不实现复杂的本地几何命令执行器
- 不实现撤销 / 重做
- 不实现模型版本树 UI
- 不实现多 job 并发调度
- 不实现复杂 STL 拓扑合法性修复
- 不在本阶段支持除 STL 之外的格式

## 方案结论

本阶段使用以下闭环：

- 前端发送编辑请求
- server 为本次请求创建 `jobId`
- server 生成 `context.json`
- Codex 基于 job 上下文生成并执行 `edit.py`
- Python 脚本将结果写到指定 `outputModelPath`
- server 校验输出 STL
- 校验成功后注册为新的模型版本并通知前端
- 前端自动切换到新的 STL

该方案的核心取舍：

- 不做厚重的本地执行器
- 允许 Codex 自由生成 Python 编辑脚本
- 但强约束输入、输出、工作目录和产物路径

## Codex 人设与系统约束

Codex 的系统约束应从当前的 Phase 3A 限制切换为：

- 你是精通 3D 建模、三角网格编辑和 STL 处理的专家
- 你可以修改 mesh 并生成新的 STL
- 你必须围绕 server 提供的 `context.json`、`baseModelPath` 和 `outputModelPath` 工作
- 你绝不能覆盖输入 STL
- 你必须将输出模型写到指定 `outputModelPath`
- 你应优先围绕 `selectionContext` 对局部区域进行修改
- 如果无法安全完成，应明确说明失败原因，不得伪造成功

当前 [codex-session.ts](C:/Users/Admin/Projects/3DModel/server/codex-session.ts) 中的：

- `baseInstructions: 'Phase 3A only. Do not claim that any STL or mesh edit has already been executed.'`

应被新的建模专家约束替代。

## Python Runner 方案

### 执行语言

本阶段固定使用 Python 作为脚本执行语言。

原因：

- 网格处理库选择更多
- Codex 生成 Python 脚本的稳定性更高
- 与 STL、mesh、`numpy`、`trimesh` 等生态兼容性更好

### 推荐依赖

建议首版预置最小可用 Python mesh 工具链：

- `numpy`
- `trimesh`

如果环境中暂未预置，Codex 仍可尝试自行处理，但首版成功率会明显下降。

## Job 目录结构

每次编辑请求都创建一个独立 job 目录。

建议目录结构：

```text
artifacts/
  models/
    model_001_original.stl
    model_002_from_model_001.stl
  jobs/
    job_001/
      context.json
      edit.py
      result.json
      logs/
```

其中：

- `artifacts/models/`：保存版本化 STL
- `artifacts/jobs/<jobId>/`：保存本次编辑所需的上下文、脚本和中间产物
- `edit.py`：Codex 生成并执行的 Python 脚本
- `result.json`：可选的执行摘要

## 模型版本链

系统中不再只跟踪“当前 STL 文件”，而是跟踪模型版本链。

例如：

- `model_001_original.stl`
- `model_002_from_model_001.stl`
- `model_003_from_model_002.stl`

每个新模型至少应记录：

- `modelId`
- `parentModelId`
- `fileName`
- `storagePath`
- `createdAt`
- `sourceJobId`

这样可以保证：

- 原模型永远保留
- 前端切换新模型后，会话仍然可引用历史模型
- 后续若要做版本树或回退，已有基础数据

## Job 上下文文件

server 在启动一次编辑 job 时，必须生成 `context.json`。

建议字段：

```json
{
  "jobId": "job_001",
  "baseModelId": "model_001",
  "activeModelId": "model_001",
  "baseModelPath": "artifacts/models/model_001_original.stl",
  "outputModelPath": "artifacts/models/model_002_from_model_001.stl",
  "selectionContext": {},
  "viewContext": {},
  "userInstruction": "把选中的区域向内压低 2mm"
}
```

其作用是让 Codex：

- 不需要从聊天文本里猜输入输出路径
- 直接读取结构化上下文
- 明确知道本次 job 的输入与输出边界

## Turn Prompt 设计

当前 [codex-turn-prompt.ts](C:/Users/Admin/Projects/3DModel/src/shared/codex-turn-prompt.ts) 只输出：

- `activeModelId`
- `selectionContext`
- `viewContext`
- `userInstruction`

本阶段应改为额外输出：

- `jobId`
- `jobWorkspace`
- `contextJsonPath`
- `baseModelPath`
- `outputModelPath`

也就是说，turn prompt 要显式告诉 Codex：

- 你当前工作的目录
- 你应读取哪一个上下文文件
- 输入 STL 在哪里
- 输出 STL 必须写到哪里

## Server 职责

server 新增以下职责：

- 为每次编辑请求创建 `jobId`
- 在 `artifacts/jobs/<jobId>/` 下准备 job 目录
- 生成 `context.json`
- 为输出模型预分配 `newModelId`
- 在 turn 完成后检查 `outputModelPath`
- 校验 STL 并注册新模型
- 向前端广播 `model_generation_started / model_generated / model_generation_failed`

建议新增模块：

- `server/model-registry.ts`
  - 管理模型版本记录
- `server/edit-job.ts`
  - 创建 job、写入上下文文件、分配路径
- `server/model-storage.ts`
  - 负责模型文件路径与读取

## 成功判定

首版不做复杂几何合法性修复，只做最小可信校验：

1. `outputModelPath` 文件存在
2. 文件大小大于 0
3. 该 STL 能被现有 Three.js `STLLoader` 重新解析

三者都满足，视为成功。

否则视为失败，并向前端发送 `model_generation_failed`。

## 前后端事件协议

在现有会话流上新增三类事件：

- `model_generation_started`
- `model_generated`
- `model_generation_failed`

### `model_generation_started`

表示本次编辑 job 已开始执行。

建议字段：

- `jobId`
- `baseModelId`

### `model_generated`

表示新模型已生成并通过基本校验。

建议字段：

- `jobId`
- `baseModelId`
- `newModelId`
- `modelLabel`
- `modelPath`

### `model_generation_failed`

表示本次编辑 job 未生成有效 STL。

建议字段：

- `jobId`
- `baseModelId`
- `message`

## 前端自动切换逻辑

当前前端 [ViewerApp.ts](C:/Users/Admin/Projects/3DModel/src/app/ViewerApp.ts) 主要支持用户本地导入 `File`。

本阶段前端应新增“从 server 获取已生成模型”的能力。

推荐新增接口：

- `GET /api/models/:modelId`

返回指定模型的 STL 文件内容。

前端收到 `model_generated` 后：

1. 调用 `GET /api/models/:modelId`
2. 读取 STL blob
3. 交给现有 `StlViewport` 重新加载
4. 更新当前 `activeModelId`
5. 广播并显示 `model_switched`
6. 保留原有 transcript

## 模型切换语义

本阶段仍保留此前规则：

- 切换 STL 不清空会话

但现在模型切换不仅来自用户导入，也可能来自 Codex 生成的新模型。

因此要区分两个事件：

- `model_generated`
  - 新模型已经生成成功
- `model_switched`
  - 当前操作对象已切换到该模型

这两个事件可能连续出现，但语义不同。

## 安全边界

尽管本阶段允许 Codex 实际编辑模型，仍需保留基本安全边界：

- 只能在 job 工作目录内读写
- 输入 STL 不允许覆盖
- 输出 STL 路径由 server 分配，不由 Codex 自行决定
- job 目录之外的文件修改依然受 Codex 审批机制约束

## UI 反馈

聊天面板中应新增与模型生成相关的系统状态提示：

- `正在生成新模型`
- `新模型已生成，正在切换`
- `新模型生成失败`

成功时前端自动加载新模型，无需用户再次手动导入。

## 错误处理

本阶段至少处理以下失败场景：

- job 目录创建失败
- `context.json` 写入失败
- Codex 未产生 `edit.py`
- `edit.py` 执行失败
- `outputModelPath` 未生成
- 生成了 STL，但无法被 `STLLoader` 重新解析

这些错误都应在聊天面板中可见，不得静默失败。

## 测试策略

本阶段自动化测试优先覆盖：

- model registry 的版本分配逻辑
- edit job 的路径与上下文文件生成
- `model_generated / failed` 事件分发
- 输出 STL 成功判定逻辑
- 前端收到 `model_generated` 后的自动切换行为

本阶段仍不要求 Playwright。

## 后续演进

本阶段完成后，可继续演进：

- 模型版本树 UI
- 撤销 / 重做
- 生成前后差异对比
- 更稳的 mesh 校验与修复
- 更强的本地几何执行器
