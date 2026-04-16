# W3 登录改进计划

## Context

基于 W3 登录功能的实际使用反馈，需要修复以下三个问题：
1. 华为内网 HTTPS 证书不被系统信任，`fetch` 报 `unable to verify the first certificate`
2. 浏览器完成鉴权后页签未关闭，用户需要手动关
3. `--login` 时按 Q 无法取消登录流程

---

## 改动步骤

### Step 9: 禁用 TLS 证书校验

**文件**: `src/services/w3auth/index.ts`

在文件顶部、所有 fetch 调用之前设置：

```typescript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
```

### Step 10: 鉴权成功后提示关闭浏览器页签

**文件**: `src/components/W3LoginFlow.tsx`

在 `success` 状态的 UI 中，将提示文案改为"登录成功，可关闭浏览器页签"。

后续后端改造支持自关闭（`set-cookie` 端点返回含 `window.close()` 的 HTML）后再移除此提示。

### Step 11: 让 Q 键能中断登录轮询

**文件**: `src/services/w3auth/index.ts` + `src/components/W3LoginFlow.tsx`

**根因**: `pollForCookie` 是 async for 循环，`W3LoginFlow` 中 `handleLogin` await 了整个 `w3Login()`。虽然 async/await 不阻塞事件循环，但 `useInput` 的 Q 键回调中 `process.exit(0)` 可能因 `showSetupDialog` 的 Ink 渲染上下文中 focus 问题未正确激活。

**改进方案**:
1. 给 `pollForCookie` 和 `w3Login` 添加 `AbortController` 支持，让外部可以取消轮询
2. `W3LoginFlow` 中维护一个 `AbortController` ref，按 Q 时调用 `abort()` 取消轮询，然后 `process.exit(0)`

---

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `src/services/w3auth/index.ts` | 添加 TLS 跳过、pollForCookie/w3Login 支持 AbortSignal |
| `src/components/W3LoginFlow.tsx` | 成功提示文案、用 AbortController 让 Q 键能中断登录流程 |

---

## 验证方式

1. `bun run build:dev:full` 编译通过
2. `./cli-dev --login` → 浏览器打开 → 完成登录 → 不再报证书错误 → 显示"登录成功，可关闭浏览器页签"
3. `./cli-dev --login` → 登录过程中按 Q → 进程退出
