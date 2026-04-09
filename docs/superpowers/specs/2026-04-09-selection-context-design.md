# STL 选择上下文导出设计文档

## 概述

本文档定义 STL Web 预览器第二阶段的设计目标：在当前轻量级 Web 预览器的基础上，采集用户当前视角和用户明确选中的三角面区域，并将这些信息导出为结构化上下文，供后续 agent / Codex 理解用户希望修改的几何区域。

第二阶段不尝试在 STL 网格上自动推断高级语义对象，不进行面组、曲面、语义边或特征面的自动识别。系统只负责稳定记录：

- 当前用户从什么方向观察模型
- 当前屏幕下可见的目标区域
- 用户通过点击或框选明确选中的三角面
- 这些选中的三角面按连通关系形成的若干选择组件

## 目标

- 获取当前 `ViewState`，描述用户当前视角
- 支持单击选中一个可见三角面
- 支持 `Shift + 拖拽` 框选一批可见三角面
- 支持 `Ctrl/Cmd` 追加选择
- 支持 `Alt` 减选
- 支持 `Esc` 清空选择
- 对当前选中的三角面集合按邻接关系拆分为若干 `SelectionComponent`
- 导出当前上下文为 `context.json`
- 让导出的上下文足以被后续 agent / Codex 用来理解用户想修改的大致几何区域

## 非目标

- 自动识别面组
- 自动识别曲面 patch
- 自动识别语义边
- 自动识别孔、槽、倒角、圆角等高级特征
- 自动将上下文直接发送给 Codex
- 套索选择
- 多模型联动选择
- 基于截图做视觉识别

## 设计原则

第二阶段采用“几何定位由系统完成，意图理解由 agent 完成”的原则。

系统只做可靠、可计算、可验证的事情：

- 三角面命中
- 三角面选择
- 三角面邻接
- 视角记录
- 结构化导出

系统不做不稳定的几何语义推断。后续 agent 在拿到结构化上下文后，再结合用户自然语言指令理解“想修改什么”。

## 用户交互

第二阶段新增以下交互：

- 单击：
  - 默认替换当前选择
  - 通过 raycast 命中一个可见三角面
- `Shift + 拖拽`：
  - 进行屏幕矩形框选
  - 选中矩形范围内的可见三角面
- `Ctrl/Cmd + 单击 / Shift + 拖拽`：
  - 追加到当前选择
- `Alt + 单击 / Shift + 拖拽`：
  - 从当前选择中减去目标三角面
- `Esc`：
  - 清空当前选择
- `导出上下文` 按钮：
  - 将当前视角和当前选择导出为 `context.json`

第二阶段不引入新的复杂模式切换。现有第一阶段交互规则保持：

- 左键拖动：旋转
- 中键拖动：平移
- 滚轮：缩放
- 重置视角：恢复默认视角

## 核心数据对象

### `ViewState`

用于描述当前观察状态，字段包括：

- `cameraPosition`
- `target`
- `up`
- `fov`
- `viewDirection`
- `dominantOrientation`
- `viewportSize`

其中：

- `viewDirection` 为从相机指向目标的归一化向量
- `dominantOrientation` 延续第一阶段的 `+X / -X / +Y / -Y / +Z / -Z`

### `TriangleRecord`

用于表示单个三角面，字段包括：

- `triangleId`
- `vertexIndices`
- `centroid`
- `normal`
- `area`
- `screenCentroid`
- `depth`

其中：

- `triangleId` 必须稳定，建议直接使用当前 `BufferGeometry` 中的三角序号
- `screenCentroid` 仅用于屏幕框选与可见性判断，不要求永久保存到所有导出内容中

### `SelectionState`

用于表示当前用户选择，字段包括：

- `mode`
  - `click`
  - `box`
- `triangleIds`
- `screenRect`
- `updatedAt`

说明：

- `screenRect` 只在框选时有值
- `triangleIds` 是当前选择的精确基础事实

### `SelectionComponent`

将当前选中的三角面按邻接图拆分后的连通块摘要，字段包括：

- `id`
- `triangleIds`
- `centroid`
- `bboxMin`
- `bboxMax`
- `avgNormal`
- `area`

这个对象不是“面组识别结果”，而只是“当前已选三角面里的连通分量”。

## 选择语义

第二阶段不推断高级面语义，因此选择系统的真实基础对象永远是三角面。

也就是说：

- 用户单击时，本质上选中一个 triangle
- 用户框选时，本质上选中一组三角面
- `SelectionComponent` 只是对用户已经选中的三角面做连通性摘要

这点是整个系统稳定性的关键。

## 三角面邻接

为了支持框选后分连通块，以及后续潜在的边界计算，需要建立三角面邻接关系。

邻接规则：

- 两个三角面共享一条边，则认为它们邻接

实现要求：

- STL 导入后，根据三角面顶点构建边表
- 边表键采用标准化边键，例如 `(minVertexId, maxVertexId)`
- 根据边表构建 `triangleId -> neighborTriangleIds[]`

第二阶段不要求基于位置容差做复杂拓扑修复。首版可以直接使用当前网格顶点索引关系；如果后续发现 STL 存在大量重复顶点导致邻接失真，再单独引入顶点归并。

## 单击选中算法

单击选中通过 `THREE.Raycaster` 完成。

流程如下：

1. 将鼠标坐标转换为 NDC
2. 用 raycaster 对当前 mesh 做相交测试
3. 取最近命中的 `faceIndex`
4. 将 `faceIndex` 映射为稳定的 `triangleId`
5. 根据当前修饰键更新 `SelectionState`

选择行为规则：

- 无修饰键：替换当前选择
- `Ctrl/Cmd`：追加 triangle
- `Alt`：减去 triangle

## 框选算法

第二阶段首版使用屏幕矩形框选。

框选流程如下：

1. 用户按下 `Shift` 开始拖拽
2. 记录屏幕起点和终点，形成 `screenRect`
3. 对当前 mesh 的所有三角面做屏幕空间筛选
4. 仅保留满足以下条件的三角面：
   - 投影后中心点位于 `screenRect` 内，或
   - 投影包围盒与 `screenRect` 相交
5. 对候选三角面做可见性过滤
6. 根据修饰键更新当前选择

更新规则：

- 无修饰键：本轮框选替换当前选择
- `Ctrl/Cmd`：追加本轮框选结果
- `Alt`：从当前选择中减去本轮框选结果

## 可见性过滤

框选默认只选取当前用户实际看到的三角面，不包含屏幕同位置但被遮挡的后方三角面。

首版可见性过滤建议采用轻量方案：

- 三角面中心必须位于当前视锥内
- 三角面法向应朝向相机
- 从相机向三角面质心附近发射射线时，最近命中应为该三角面本身

这个策略不是绝对完美，但在第二阶段首版里足以提供可用的“只选可见内容”能力。

## 选择组件生成

当 `SelectionState` 更新后，系统应立即基于当前已选三角面集合生成 `SelectionComponent[]`。

流程如下：

1. 读取已选 `triangleIds`
2. 在三角面邻接图上做 DFS / BFS
3. 只遍历已选三角面
4. 将每个连通块输出为一个 `SelectionComponent`

每个组件需要计算：

- 三角面集合
- 总面积
- 几何中心
- 包围盒
- 平均法向

组件的意义是：

- 帮助 agent 知道这次选择由几块几何组成
- 避免把一大串 triangle ids 当成毫无结构的平面列表

## 上下文导出

第二阶段首版使用显式导出，而不是自动实时写文件。

导出方式：

- 点击 `导出上下文` 按钮
- 浏览器下载一个 `context.json`

建议文件名格式：

- `context-YYYY-MM-DDTHH-mm-ss.json`

导出 JSON 结构建议如下：

```json
{
  "version": 1,
  "model": {
    "file": "part.stl"
  },
  "view": {
    "cameraPosition": [12.3, 8.1, 5.4],
    "target": [0, 0, 0],
    "up": [0, 1, 0],
    "fov": 50,
    "viewDirection": [-0.79, -0.46, -0.39],
    "dominantOrientation": "+X",
    "viewportSize": [1440, 960]
  },
  "selection": {
    "mode": "box",
    "screenRect": [400, 260, 620, 440],
    "triangleIds": [1824, 1825, 1826]
  },
  "components": [
    {
      "id": "sel_0",
      "triangleIds": [1824, 1825, 1826],
      "centroid": [1.2, 0.4, -0.7],
      "bboxMin": [0.8, 0.1, -1.0],
      "bboxMax": [1.6, 0.7, -0.3],
      "avgNormal": [0.98, 0.03, 0.01],
      "area": 12.4
    }
  ]
}
```

## UI 变化

第二阶段新增最少量 UI：

- `导出上下文` 按钮
- `清空选择` 按钮
- 轻量状态条，显示：
  - 已选三角面数量
  - 连通块数量
  - 当前框选提示

框选过程中需要一个屏幕 overlay，用来展示拖拽矩形。

选中的三角面应在 3D 视口中做明显高亮，以便用户确认当前上下文是否正确。

## 工程结构建议

建议在现有项目基础上新增以下文件：

```text
src/
  viewer/
    mesh-topology.ts
    selection-manager.ts
    screen-selection.ts
    selection-context.ts
    selection-overlay.ts
```

职责划分：

- `mesh-topology.ts`
  - 三角面邻接表
- `selection-manager.ts`
  - 当前选择状态、追加、减选、清空
- `screen-selection.ts`
  - 框选命中逻辑
- `selection-context.ts`
  - 导出 JSON 结构组装
- `selection-overlay.ts`
  - 拖拽框选矩形的 DOM 绘制

`StlViewport.ts` 继续作为整合入口，负责：

- raycast
- 框选命中
- 选中高亮
- 当前视角读取
- context 导出入口

## 测试策略

自动化测试应优先覆盖：

- triangle id 映射稳定性
- 邻接图构建
- `SelectionState` reducer：
  - replace
  - add
  - subtract
  - clear
- 连通分量拆分
- context JSON 输出结构

手工验证应覆盖：

- 单击选中单个三角面
- `Shift + 拖拽` 框选
- `Ctrl/Cmd` 追加选择
- `Alt` 减选
- `Esc` 清空
- 高亮显示正确
- `导出上下文` 可下载 JSON
- 切换视角后导出的 `ViewState` 变化正确

## 风险与后续扩展

第二阶段首版的主要风险是大模型 STL 下的性能问题，尤其是在：

- 大量三角面框选
- 可见性过滤
- 高频邻接遍历

应对策略：

- 第二阶段首版先按小中型 STL 交付
- 若后续性能不足，再考虑引入 `three-mesh-bvh` 做加速

后续可能扩展但不属于本期范围的能力：

- 套索选择
- 基于边的选择
- 自动特征识别
- 与 Codex 的直接桥接
