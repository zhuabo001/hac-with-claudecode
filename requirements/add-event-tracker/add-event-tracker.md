## 前置知识

### eventTracker函数
当前已经拥有了eventTracker函数，这个函数传递一个`{}`, 内部包含了多个字段，例如`input`，这个字段专门用来记录cli的输入框中的内容，例如`scene`这个字段，这个字段用来区分此时用户是否使用了slash command，这个值包含两个选项，分别是`conversation`以及`slash_command`, `conversation`是用户未使用slashCommand，仅输入文字的场景。其余字段不在此处一一展示，和本需求无关。当考虑实现本文档其余需求时，请默认eventTracker函数已经被实现。

### 生命周期钩子

当前工程内置了一套完整的生命周期 hook 系统，定义了 27 个生命周期事件（见 `src/entrypoints/sdk/coreTypes.ts`），其中与本需求相关的事件包括：

- `SessionStart`：会话启动时触发
- `SessionEnd`：会话结束时触发
- `UserPromptSubmit`：用户提交输入时触发
- `PostToolUse`：工具调用完成后触发
- `Stop`：CLI 停止/关闭时触发

Hook 支持 4 种类型：`command`（执行 shell 命令）、`prompt`（LLM 评估）、`http`（HTTP POST 请求）、`agent`（agentic verifier）。用户可在 settings.json 中配置 hook，也可以在代码中通过对应的 `execute*Hooks()` 函数直接调用。

核心调度函数为 `src/utils/hooks.ts` 中的 `executeHooks()`，各生命周期事件均有对应的封装函数（如 `executeSessionStartHooks()`、`executeSessionEndHooks()` 等），基于 async generator 模式，支持异步执行、超时控制和条件匹配。

以下是当前工程中内置钩子的调用示例：

**示例 1：SessionStart — 会话启动钩子**（`src/utils/sessionStart.ts`）

```typescript
const resolvedAgentType = agentType ?? getMainThreadAgentType()
for await (const hookResult of executeSessionStartHooks(
  source,        // 'startup' | 'resume' | 'clear' | 'compact'
  sessionId,
  resolvedAgentType,
  model,
  undefined,
  undefined,
  forceSyncExecution,
)) {
  if (hookResult.message) {
    hookMessages.push(hookResult.message)
  }
  if (hookResult.additionalContexts?.length) {
    additionalContexts.push(...hookResult.additionalContexts)
  }
  if (hookResult.initialUserMessage) {
    pendingInitialUserMessage = hookResult.initialUserMessage
  }
}
```

**示例 2：UserPromptSubmit — 用户提交输入钩子**（`src/utils/processUserInput/processUserInput.ts`）

```typescript
for await (const hookResult of executeUserPromptSubmitHooks(
  inputMessage,                          // 用户输入的文本
  appState.toolPermissionContext.mode,    // 权限模式
  context,
  context.requestPrompt,
)) {
  if (hookResult.blockingError) {
    // hook 可以阻止本次提交
    return {
      messages: [createSystemMessage(blockingMessage, 'warning')],
      shouldQuery: false,
    }
  }
  if (hookResult.additionalContexts?.length) {
    // hook 可以注入额外上下文
    result.messages.push(createAttachmentMessage({
      type: 'hook_additional_context',
      content: hookResult.additionalContexts.map(applyTruncation),
      hookName: 'UserPromptSubmit',
    }))
  }
}
```

**示例 3：SessionEnd — 会话结束钩子**（`src/utils/gracefulShutdown.ts`）

```typescript
const { executeSessionEndHooks, getSessionEndHookTimeoutMs } = await import('./hooks.js')
const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()

try {
  await executeSessionEndHooks(reason, {
    ...options,
    signal: AbortSignal.timeout(sessionEndTimeoutMs),
    timeoutMs: sessionEndTimeoutMs,
  })
} catch {
  // 忽略 SessionEnd hook 异常（包括超时）
}
```

在实现打点需求时，应优先利用已有的 hook 机制，在对应的生命周期事件中注入打点逻辑。


### isGit函数与isInWhitelist函数
isGit函数：会查看当前路径是否包含远程仓库
isInWhitelist函数： 会调用某个特定接口查看该远程仓库是否位于白名单中(无需在意该接口的实现，默认已经实现)

这两个函数会的作用是先通过`isGit`判断当前路径是否为git仓库，如果是，会通过`isWhitelist`判断当前路径是否在代码仓白名单上。这两个函数请默认为已经实现。需要的时候直接调用即可。


## cli启动时添加打点
当cli启动时，需要上报启动的时间戳，以及用户的username

## 输入提交时需要添加打点
当用户按回车提交输入框内容时，需要上报提交的内容，并记录时间戳，请考虑到scene字段，若提交的内容是斜杠命令时，scene应该是`slash_command`,若提交的内容不包含斜杠命令时，`scene`应该是`conversation`.username也是需要被记录的。

## 本轮会话结束时需要添加打点
### 常规打点内容
当一轮会话结束时，需要上报会话结束时的时间戳，username也是需要被记录的

### token消耗
需要统计并上报本轮会话消耗的总的token数，优先使用符合该生命周期的hook，充分利用hook机制去进行打点上报。
同样的，username需要被上报。

## cli被关闭时需要添加打点
当cli被关闭时，需要上报cli被关闭的时间戳和username。

## 当该路径为git仓并且为白名单仓库时

当该工作目录属于在白名当中的git仓库时，需要记录并上报write、edit以及bash工具产生的完整代码块。username同样需要被记录

