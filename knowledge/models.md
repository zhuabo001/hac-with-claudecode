# 模型切换系统 (Model Switching System)

## 概述

Claude Code 的模型切换系统允许用户在同一会话中动态切换不同的 AI 模型。该系统支持多种模型别名、订阅层级管理、第三方提供商适配，以及灵活的模型选择 UI。

## 核心组件

### 1. 命令入口 (`src/commands/model/model.tsx`)

模型命令模块提供三种执行模式：

- **`/model`** - 打开交互式模型选择器 UI
- **`/model [modelName]`** - 直接通过参数设置模型（如 `/model sonnet`）
- **`/model --help`** - 显示帮助信息

关键组件：
- `ModelPickerWrapper` - 渲染交互式模型选择器
- `SetModelAndClose` - 通过参数直接设置模型
- `ShowModelAndClose` - 显示当前模型信息

### 2. 模型选择器 UI (`src/components/ModelPicker.tsx`)

基于 Ink/React 的交互式终端 UI 组件，提供：
- 模型列表展示（基于用户订阅层级动态生成）
- Effort Level（努力级别）选择
- Fast Mode 状态指示
- 键盘导航支持
- 当前模型高亮显示

### 3. 模型选项生成 (`src/utils/model/modelOptions.ts`)

```typescript
getModelOptions(fastMode?: boolean): ModelOption[]
```

根据用户类型生成可选模型列表：

| 用户类型 | 默认模型 | 可选模型 |
|---------|---------|---------|
| ANT | Opus 1M | Sonnet 4.6, Sonnet 1M, Haiku 4.5, 自定义模型 |
| Codex | GPT-5.3 Codex | GPT-5.4, GPT-5.4 Mini |
| Max/Premium | Opus 4.6 | Opus 1M, Sonnet 4.6, Sonnet 1M, Haiku 4.5 |
| Pro/Standard | Sonnet 4.6 | Sonnet 1M, Opus 4.6, Opus 1M, Haiku 4.5 |
| PAYG 1P | Sonnet 4.6 | Sonnet 1M, Opus 4.6, Opus 1M, Haiku 4.5 |
| PAYG 3P | Sonnet 4.5 | 自定义 Sonnet, Sonnet 4.6, Opus 4.1, Opus 4.6, Haiku |

### 4. 模型别名系统 (`src/utils/model/aliases.ts`)

```typescript
MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan']
```

别名支持 `[1m]` 后缀表示 1M 上下文窗口版本：
- `sonnet[1m]` - Sonnet 4.6 with 1M context
- `opus[1m]` - Opus 4.6 with 1M context

特殊别名：
- `best` - 解析为当前可用的最佳模型（通常是 Opus）
- `opusplan` - Plan 模式下使用 Opus，其他模式使用 Sonnet

### 5. 模型名称解析 (`src/utils/model/model.ts`)

#### 优先级链
```
1. /model 命令覆盖 (最高优先级)
2. --model 启动参数
3. ANTHROPIC_MODEL 环境变量
4. 用户设置 (settings.json)
5. 订阅层级默认值 (最低优先级)
```

#### 核心函数

```typescript
// 获取当前会话使用的模型
getMainLoopModel(): ModelName

// 获取用户指定的模型设置（可能仍是别名）
getUserSpecifiedModelSetting(): ModelSetting | undefined

// 解析用户输入为完整模型名
parseUserSpecifiedModel(modelInput: ModelName | ModelAlias): ModelName

// 获取给定订阅层级的默认模型
getDefaultMainLoopModelSetting(): ModelName | ModelAlias
```

#### 解析示例

| 输入 | 解析结果 (1P) | 解析结果 (3P) |
|------|-------------|--------------|
| `sonnet` | `claude-sonnet-4-6-20250514` | 第三方对应版本 |
| `opus[1m]` | `claude-opus-4-6-20250514[1m]` | 第三方对应版本 |
| `haiku` | `claude-haiku-4-5-20250324` | 第三方对应版本 |
| `best` | `claude-opus-4-6-20250514` | 第三方对应版本 |

### 6. 模型字符串映射 (`src/utils/model/modelStrings.ts`)

处理不同 API 提供商的模型 ID 差异：

```typescript
// 模型配置示例 (src/utils/model/configs.ts)
{
  sonnet46: {
    firstParty: 'claude-sonnet-4-6-20250514',
    bedrock: 'us.anthropic.claude-sonnet-4-6-v1:0',
    vertex: 'gemini-sonnet-4-6',
    foundry: 'sonnet-4-6'
  },
  // ...
}
```

关键函数：
- `getModelStrings()` - 获取当前提供商的模型 ID 映射
- `resolveOverriddenModel()` - 将第三方 ARN 解析回规范名称
- `ensureModelStringsInitialized()` - 确保 Bedrock 用户完成初始化

### 7. 模型白名单 (`src/utils/model/modelAllowlist.ts`)

支持组织级别的模型访问控制：

```typescript
isModelAllowed(model: string): boolean
```

匹配规则（按优先级）：
1. **精确匹配** - 完整模型 ID 完全相等
2. **版本前缀匹配** - `opus-4-5` 匹配 `claude-opus-4-5-20251101`
3. **家族通配符** - `opus` 匹配所有 opus 型号（若无更具体的条目）
4. **别名解析** - 将别名解析后再匹配

### 8. 模型验证 (`src/utils/model/validateModel.ts`)

```typescript
validateModel(model: string): Promise<{ valid: boolean; error?: string }>
```

验证流程：
1. 检查白名单
2. 检查已知别名（直接通过）
3. 检查缓存
4. 发起最小化 API 调用验证

缓存机制避免重复 API 调用。

### 9. 状态管理 (`src/state/AppStateStore.ts`)

```typescript
mainLoopModel: ModelSetting        // 当前模型设置（别名或完整名称）
mainLoopModelForSession: ModelSetting | null  // 会话级别的临时覆盖
```

`mainLoopModelForSession` 用于 Plan 模式下的临时模型覆盖。

### 10. 模型能力 (`src/utils/model/modelCapabilities.ts`)

缓存模型元数据（最大 token 数等）：
- 文件路径: `~/.claude/cache/model-capabilities.json`
- 仅适用于 ANT 用户和第一方提供商

## 交互流程

### 交互式选择流程
```
用户输入 /model
  → ModelPickerWrapper 组件渲染
    → getModelOptions() 生成可选模型列表
    → 用户选择模型 + effort level
    → handleSelect() 更新 AppState
      → onChangeAppState 同步到 settings
      → 发送分析事件
```

### 命令行直接设置流程
```
用户输入 /model sonnet
  → SetModelAndClose 组件处理
    → isKnownAlias() 检查是否是已知别名
    → validateModel() 验证模型有效性
    → setAppState() 更新状态
    → onDone() 显示结果消息
```

## 第三方提供商支持

### Bedrock
- 动态获取推理profile列表
- 映射region-specific模型ID
- 支持 `modelOverrides` 设置自定义映射

### Vertex / Foundry
- 使用提供商的模型ID
- 不提供营销名称转换

### 自定义模型支持
- `ANTHROPIC_DEFAULT_*_MODEL` 环境变量覆盖默认模型
- `ANTHROPIC_CUSTOM_MODEL_OPTION` 环境变量添加自定义选项
- `ANTHROPIC_DEFAULT_*_MODEL_DESCRIPTION` 提供自定义描述

## 快速模式 (Fast Mode)

模型选择器会根据当前 fast mode 状态显示不同的定价信息：
- 启用 fast mode 时显示闪电图标
- 不同模型对 fast mode 的支持不同

## 分析事件

模型切换时发送 `tengu_model_command_menu` 事件：
- `action`: 选择/取消
- `from_model`: 原模型
- `to_model`: 新模型
