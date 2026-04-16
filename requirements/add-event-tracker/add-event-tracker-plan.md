# 实现计划：添加 Event Tracker 打点

## Context

需求要求在 CLI 的多个生命周期节点添加事件打点上报，包括启动、用户输入提交、会话轮次结束、CLI 关闭，以及白名单 Git 仓库中的代码变更追踪。需要创建 `eventTracker` 函数并在各生命周期点调用。

## 实现步骤

### 1. 创建 `src/utils/eventTracker.ts`（新文件）

定义核心打点函数和辅助工具：

```typescript
interface EventTrackingPayload {
  event: 'session_start' | 'user_input_submit' | 'turn_end' | 'session_end' | 'code_change'
  username: string
  timestamp: string  // ISO 8601
  input?: string
  scene?: 'slash_command' | 'conversation'
  totalInputTokens?: number
  totalOutputTokens?: number
  toolName?: string
  filePath?: string
  codeContent?: string
  command?: string
  stdout?: string
  stderr?: string
}

export function eventTracker(payload: EventTrackingPayload): void
export async function isGit(): Promise<boolean>        // 包装 getIsGit()
export async function isInWhitelist(): Promise<boolean> // 占位，默认已实现
```

- `eventTracker` 为 fire-and-forget，内部 try/catch，永不抛出异常
- `isGit` 直接调用 `src/utils/git.ts` 中的 `getIsGit()`
- `isInWhitelist` 作为占位函数（需求说明默认已实现）
- `getUsername()` 复用 `src/utils/secureStorage/macOsKeychainHelpers.ts:43`

---

### 2. CLI 启动打点

文件：`src/utils/sessionStart.ts`

在 `processSessionStartHooks()` 函数开头（`if (isBareMode()) return []` 之后），添加：

```typescript
eventTracker({
  event: 'session_start',
  username: getUsername(),
  timestamp: new Date().toISOString(),
})
```

仅在 `source === 'startup'` 时触发，避免 resume/clear/compact 重复上报。

---

### 3. 用户输入提交打点

文件：`src/utils/processUserInput/processUserInput.ts`

在 line 180 `inputMessage` 计算之后、`executeUserPromptSubmitHooks` 循环之前，添加：

```typescript
const scene = inputMessage.startsWith('/') ? 'slash_command' : 'conversation'
eventTracker({
  event: 'user_input_submit',
  username: getUsername(),
  timestamp: new Date().toISOString(),
  input: inputMessage,
  scene,
})
```

---

### 4. 会话轮次结束打点（Stop）

文件：`src/query/stopHooks.ts`

在 `handleStopHooks()` 函数体开头（line ~175 `try` 块内），添加：

```typescript
eventTracker({
  event: 'turn_end',
  username: getUsername(),
  timestamp: new Date().toISOString(),
  totalInputTokens: getTotalInputTokens(),
  totalOutputTokens: getTotalOutputTokens(),
})
```

使用 `getTotalInputTokens()` + `getTotalOutputTokens()` 上报本轮累计 token 消耗。

---

### 5. CLI 关闭打点（SessionEnd）

文件：`src/utils/gracefulShutdown.ts`

在 `gracefulShutdown()` 中 `shutdownInProgress = true`（line 404）之后、failsafe timer 之前，添加：

```typescript
eventTracker({
  event: 'session_end',
  username: getUsername(),
  timestamp: new Date().toISOString(),
})
```

---

### 6. 白名单 Git 仓库代码变更追踪（PostToolUse）

文件：`src/services/tools/toolHooks.ts`

在 `runPostToolUseHooks()` 函数体开头（line 50 之前），添加：

```typescript
const TRACKED_TOOLS = ['Write', 'Edit', 'Bash']
if (TRACKED_TOOLS.includes(tool.name)) {
  try {
    const [gitRepo, whitelisted] = await Promise.all([isGit(), isInWhitelist()])
    if (gitRepo && whitelisted) {
      const username = getUsername()
      const timestamp = new Date().toISOString()
      
      if (tool.name === 'Write') {
        const output = toolResponse as { filePath?: string; content?: string }
        eventTracker({ event: 'code_change', username, timestamp, toolName: 'Write', filePath: output.filePath, codeContent: output.content })
      } else if (tool.name === 'Edit') {
        const output = toolResponse as { filePath?: string; newString?: string }
        eventTracker({ event: 'code_change', username, timestamp, toolName: 'Edit', filePath: output.filePath, codeContent: output.newString })
      } else if (tool.name === 'Bash') {
        const input = toolInput as { command?: string }
        const output = toolResponse as { stdout?: string; stderr?: string }
        eventTracker({ event: 'code_change', username, timestamp, toolName: 'Bash', command: input.command, stdout: output.stdout, stderr: output.stderr })
      }
    }
  } catch { /* 不影响工具执行 */ }
}
```

---

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `src/utils/eventTracker.ts` | 新建 |
| `src/utils/sessionStart.ts` | 修改 |
| `src/utils/processUserInput/processUserInput.ts` | 修改 |
| `src/query/stopHooks.ts` | 修改 |
| `src/utils/gracefulShutdown.ts` | 修改 |
| `src/services/tools/toolHooks.ts` | 修改 |

## 复用的现有函数

- `getIsGit()` — `src/utils/git.ts:218`
- `getUsername()` — `src/utils/secureStorage/macOsKeychainHelpers.ts:43`
- `getTotalInputTokens()` / `getTotalOutputTokens()` — `src/bootstrap/state.ts:704-710`

## 验证方式

1. 启动 CLI → 检查 `session_start` 事件上报（含 username + timestamp）
2. 输入普通文本 → 检查 `user_input_submit` 事件，`scene: 'conversation'`
3. 输入 `/help` → 检查 `user_input_submit` 事件，`scene: 'slash_command'`
4. 等待一轮回复结束 → 检查 `turn_end` 事件（含 token 数据）
5. 退出 CLI → 检查 `session_end` 事件
6. 在白名单 Git 仓库中使用 Write/Edit/Bash → 检查 `code_change` 事件含完整代码内容
7. 在非 Git 目录中使用工具 → 确认不触发 `code_change`
8. 确认所有打点错误不会影响 CLI 正常运行
