# 第三阶段前置能力设计文档
## 概述

本文档定义 STL Web 预览器第三阶段的前置能力设计。该阶段不直接实现 STL 修改，而是先完成一条稳定的“选区上下文 -> Codex 会话 -> 流式返回 -> 前端对话面板”的闭环，为后续真正的几何修改执行打基础。

第三阶段首版采用以下范围约束：

- 单用户
- 单会话
- 内存态
- 本地轻量 server
- 前端右侧对话面板
- 可连接本地 `codex app-server`
- 支持流式消息显示
- 支持暂停、等待人工决策、恢复
- 切换 STL 时不清空会话
- 仅用户手动点击时才清空会话

第三阶段首版明确不包含 STL 几何修改执行。该能力在后续阶段单独设计。

## 目标

- 封装一个轻量本地 server，负责启动并维护一个 Codex 会话
- 在前端增加对话面板，允许用户在选中三角面后直接输入修改意图
- 发送消息时自动附带当前 `selectionContext`、`viewContext` 与 `activeModelId`
- 将 Codex 的返回内容以流式方式展示在前端
- 在 Codex 需要人工决策时，前端明确展示暂停态和待决策内容
- 支持用户提交决策并恢复同一个会话
- 切换 STL 文件或加载新的派生模型时，不清空现有会话记录
- 在 UI 中明确显示是否成功连接到 `codex app-server`

## 非目标

- 在本阶段直接修改 STL 或输出新的 STL 文件
- 会话持久化到磁盘
- 页面刷新后的会话恢复
- 多会话管理
- 多用户并发
- 版本树可视化管理
- Playwright 端到端自动化测试

## 方案结论

本阶段采用以下架构：

- 前端：现有 Vite + TypeScript 应用，增加右侧对话面板
- 本地 server：Node.js 轻量 BFF
- Codex 接入：由本地 server 启动并连接 `codex app-server`
- 前后端通信：
  - 前端向 server 发送 `POST` 请求
  - server 向前端通过 `SSE` 推送流式事件

选择该方案的原因：

- `SSE` 对“服务端持续输出、用户偶尔输入”的场景足够简单
- 前端不直接连接 `codex app-server`，会话和错误处理边界更清晰
- server 可以统一处理连接状态、会话状态、消息归一化和模型切换事件

## Codex 启动策略

本地 server 启动 Codex 时固定使用以下命令：

```bash
codex --sandbox danger-full-access --ask-for-approval never app-server --listen ws://127.0.0.1:<PORT>
```

要求如下：

- 仅监听 `127.0.0.1`
- 由 server 分配和管理端口
- server 负责监控 Codex 子进程生命周期
- 若 Codex 未启动成功，前端必须收到明确的失败状态

之所以固定使用 `danger-full-access + on-request`，是为了避免后续接入本地文件和命令能力时因为权限策略不一致导致行为漂移。

## 状态模型

本阶段必须明确区分两类状态：

### Codex 连接状态

表示本地 server 是否已成功连接到 `codex app-server`。状态包括：

- `starting`
- `connected`
- `disconnected`
- `failed`

该状态用于前端顶部或面板头部的连接指示灯显示。

### 会话状态

表示当前聊天会话的运行状态。状态包括：

- `idle`
- `sending`
- `streaming`
- `waiting_decision`
- `resuming`
- `completed`
- `failed`

这两个状态不能混用。允许出现：

- 已连接，但当前会话等待决策
- 已连接，但当前会话失败
- 未连接，但前端仍保留旧 transcript

## 前端 UI 结构

本阶段在现有页面上新增两处 UI：

### 右侧对话面板

采用固定右侧侧栏，不使用浮层。

面板分为四个区域：

- 头部
  - Codex 连接状态灯与文字
  - 当前会话状态文字
  - 当前 `activeModelId` 或模型名
  - `清空会话` 按钮
- 消息流
  - 用户消息
  - assistant 流式消息
  - 系统消息
  - 模型切换消息
  - 待决策卡片
- 上下文摘要条
  - 已选三角面数量
  - 连通块数量
  - 当前朝向
  - 当前激活模型
- 输入区
  - 文本输入框
  - 发送按钮

### 底部控制区

在现有 viewer 底部控制区增加一个新按钮：

- `清空会话`

该按钮与右侧面板头部按钮语义一致，点击后只清会话，不清当前模型。

## 连接状态提示

前端必须用“红绿灯 + 文字”明确表示 `codex app-server` 连接状态。

推荐呈现如下：

- 绿灯：`已连接到 Codex`
- 红灯：`未连接到 Codex`
- 红灯：`Codex 启动中`
- 红灯：`Codex 连接失败`

虽然视觉上主要使用红绿灯，但内部状态仍按 `starting / connected / disconnected / failed` 区分。

## 前后端通信

### 前端发送消息

前端通过：

- `POST /api/session/message`

发送一次用户输入和当前上下文。

请求体格式：

```json
{
  "sessionId": "sess_main",
  "activeModelId": "model_003",
  "message": {
    "role": "user",
    "text": "把我选中的区域向内缩 2mm"
  },
  "selectionContext": {
    "triangleIds": [1824, 1825, 1826],
    "components": []
  },
  "viewContext": {
    "cameraPosition": [0, 0, 0],
    "target": [0, 0, 0],
    "dominantOrientation": "+X"
  }
}
```

### 前端接收流式事件

前端通过：

- `GET /api/session/stream`

建立单条 `SSE` 长连接，接收本地 server 推送的事件。

### 用户提交决策

当前会话进入等待决策后，前端通过：

- `POST /api/session/decision`

提交结构化决策结果。

### 清空会话

用户点击清空会话时，前端通过：

- `POST /api/session/clear`

请求 server 重置会话。

### 查询连接状态

前端初始化或重连时，通过：

- `GET /api/status`

读取当前 Codex 连接状态和基础会话状态。

## 事件协议

server 与前端之间的流式事件需收敛为固定事件类型：

- `connection_status_changed`
- `session_started`
- `message_started`
- `message_delta`
- `message_completed`
- `status_changed`
- `needs_decision`
- `session_paused`
- `session_resumed`
- `model_switched`
- `session_cleared`
- `error`

其中：

- `message_delta` 用于 assistant 文本流式拼接
- `needs_decision` 必须包含结构化字段，而不是仅返回一段自然语言
- `model_switched` 用于告知前端当前 active model 已变化，但会话仍保留

`needs_decision` 建议结构如下：

```json
{
  "type": "needs_decision",
  "decisionId": "dec_01",
  "question": "是否继续按当前假设处理？",
  "options": ["继续", "取消"]
}
```

## 会话内存结构

本阶段 server 只使用内存态会话存储。

建议结构：

```ts
type SessionState = {
  id: string
  codexSessionId: string | null
  status: 'idle' | 'sending' | 'streaming' | 'waiting_decision' | 'resuming' | 'completed' | 'failed'
  transcript: ChatMessage[]
  activeModelId: string | null
  pendingDecision?: {
    decisionId: string
    question: string
    options: string[]
  }
}
```

说明：

- `transcript` 保留完整聊天历史
- `activeModelId` 记录当前激活模型
- `pendingDecision` 用于恢复被暂停的会话
- 会话刷新页面后丢失，符合本阶段内存态范围

## 模型切换语义

本阶段要求切换 STL 时不清空会话。

因此系统必须显式处理模型切换事件，而不是隐式覆盖。

规则如下：

- 用户加载新的 STL 或新的派生模型时，更新 `activeModelId`
- 原有 transcript 保留
- 原有 Codex session 保留
- server 自动向 transcript 中插入一条系统事件
- 前端消息流中显示一条模型切换消息

建议系统消息内容表达为：

- 当前激活模型已切换到 `model_xxx`
- 历史会话保留
- 后续编辑意图应基于新模型重新发送

这样可以保留上下文，同时避免 Codex 将旧模型上下文误认为当前活动对象。

## 清空会话语义

`清空会话` 只清除以下内容：

- transcript
- 当前 Codex session
- pending decision
- 当前会话状态

`清空会话` 不清除以下内容：

- 当前 STL 文件
- 当前 viewer 状态
- 当前 selectionContext
- 当前 active model 显示

清空后，系统应重新进入一个空的新会话，而不是关闭整个前端页面。

## 工程结构建议

建议新增如下目录：

```text
server/
  index.ts
  codex-process.ts
  codex-session.ts
  codex-adapter.ts
  routes.ts

src/
  chat/
    ChatPanel.ts
    chat-store.ts
    session-client.ts
```

职责划分如下：

- `server/index.ts`
  - 启动 HTTP 服务
  - 启动 Codex 子进程
- `server/codex-process.ts`
  - 启动、停止、监控 `codex app-server`
  - 维护连接状态
- `server/codex-session.ts`
  - 维护单会话内存态
- `server/codex-adapter.ts`
  - 将 `codex app-server` 原始事件转换为前端事件
- `server/routes.ts`
  - 暴露 HTTP 与 SSE 接口
- `src/chat/ChatPanel.ts`
  - 渲染右侧聊天面板
- `src/chat/chat-store.ts`
  - 管理前端聊天状态和事件归并
- `src/chat/session-client.ts`
  - 管理 `POST` 请求与 `SSE` 连接

## 协议绑定建议

server 不应手写 `codex app-server` 的协议类型。

建议优先使用：

- `codex app-server generate-ts`
- 或 `codex app-server generate-json-schema`

生成协议绑定，再在本地 server 内做一层很薄的 adapter。

这样做的原因：

- 降低手写协议出错概率
- 后续 Codex 协议升级时更容易跟进
- adapter 层可以稳定输出本项目自己的事件模型

## 错误处理

本阶段至少需要明确处理以下错误：

- Codex 子进程启动失败
- `codex app-server` 连接失败
- SSE 断开
- 当前会话发送消息失败
- 用户在无连接状态下点击发送
- 会话等待决策时再次重复发送
- 提交了无效 `decisionId`

预期行为如下：

- 所有错误都需要在聊天面板中可见
- 连接错误优先更新红绿灯状态
- 会话错误优先更新会话状态
- 若 SSE 断开，前端应尝试有限次重连
- 若重连失败，UI 进入显式失败态，而不是静默丢失更新

## 测试策略

本阶段不使用 Playwright。

自动化测试优先覆盖：

- `codex-process` 的启动参数和连接状态迁移
- `codex-session` 的 clear、pause、resume、model switch
- `codex-adapter` 的事件归一化
- 前端 `chat-store` 对流式事件的拼接和状态更新
- `清空会话` 只清会话不清模型
- 模型切换后 transcript 保留
- `needs_decision` 卡片渲染逻辑

集成测试建议通过伪造 app-server 事件流模拟以下场景：

- 正常 streaming
- streaming -> waiting_decision
- decision -> resumed -> completed
- connection failed
- session failed

## 后续演进

本阶段完成后，可进入下一阶段：

- 将“聊天请求 + 选区上下文”真正连接到 STL 修改执行链路
- 产出派生 STL，而不是覆盖原 STL
- 建立模型版本链

但这些内容不属于本设计文档范围。
