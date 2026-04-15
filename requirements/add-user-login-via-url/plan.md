# W3 登录功能实现计划

## Context

当前 CLI 工具使用 Anthropic OAuth 认证体系（ConsoleOAuthFlow + OAuthService + keychain 存储）。需求要求用 w3 SSO 登录完全替代现有 OAuth 认证。w3 登录通过浏览器跳转到华为 w3 SSO 页面完成认证，cookie 经后端中转存储，CLI 端通过 session_id 获取 cookie 并换取 token，最终写入 `~/.cache/freecode/.userinfo.json`。

---

## 实现步骤

### Step 1: 创建 `src/utils/w3UserInfo.ts` — 用户信息读写工具

新建文件，提供以下函数：

- `getUserInfoPath()`: 返回 `~/.cache/freecode/.userinfo.json` 的完整路径（跨平台，Windows 用 `C:/Users/{user_id}/.cache/freecode/`）
- `getUserInfo()`: 同步读取并解析文件，返回 `{ cookie: string, token: string } | null`（文件不存在或格式错误返回 null）
- `saveUserInfo(data: { cookie: string, token: string })`: 写入文件，自动创建目录（`fs.mkdirSync` + `recursive: true`）
- `hasValidUserInfo()`: 检查文件是否存在且包含 cookie 和 token 字段

使用 `readFileSync` / `writeFileSync`，与现有 `getGlobalConfig()` (`src/utils/config.ts`) 的同步读写模式一致。

### Step 2: 创建 `src/services/w3auth/index.ts` — W3 登录服务

新建文件，核心逻辑：

```typescript
// URL 常量（硬编码，使用实际 URL 替换 fake 版本）
const W3_LOGIN_BASE = 'https://www.loginw3.hw.rnd.com/'
const HAC_API_BASE = 'https://www.hac-y.hw.rnd.com/api/v1'
const SSO_VERIFY_TOKEN_URL = 'https://...'  // sso_verify_token_url

export function generateSessionId(): string {
  return Bun.randomUUIDv7()
}

export function buildW3LoginUrl(sessionId: string): string {
  const setSessionUrl = `${HAC_API_BASE}/set-cookie/${sessionId}`
  return `${W3_LOGIN_BASE}?redirect=${encodeURIComponent(setSessionUrl)}`
}

export async function fetchCookie(sessionId: string): Promise<string> {
  // GET get_session_url，从 response JSON 中提取 cookie 字段
  const res = await fetch(`${HAC_API_BASE}/get-cookie/${sessionId}`)
  if (!res.ok) throw new Error(`获取cookie失败: HTTP ${res.status}`)
  const data = await res.json()
  if (!data.cookie) throw new Error('服务端未返回cookie，请确认是否已在浏览器完成登录')
  return data.cookie
}

export async function verifyToken(cookie: string): Promise<string> {
  // GET sso_verify_token_url，cookie 放在 headers.Cookie
  const res = await fetch(SSO_VERIFY_TOKEN_URL, {
    headers: { Cookie: cookie }
  })
  if (!res.ok) throw new Error(`Token验证失败: HTTP ${res.status}`)
  const data = await res.json()
  return data.token
}

export async function w3Login(): Promise<{ cookie: string, token: string }> {
  const sessionId = generateSessionId()
  const loginUrl = buildW3LoginUrl(sessionId)

  const { openBrowser } = await import('../../utils/browser.js')
  const opened = await openBrowser(loginUrl)
  if (!opened) throw new Error('无法打开浏览器，请手动访问登录页面')

  // 轮询等待用户在浏览器完成登录
  const cookie = await pollForCookie(sessionId)
  const token = await verifyToken(cookie)
  return { cookie, token }
}
```

关于轮询 `pollForCookie`：需求文档澄清说"并不是真的按秒来进行定时任务"，但由于用户在浏览器端操作需要时间，CLI 端必须等待。实现为一个带超时的轮询循环（每 2 秒调用一次 `fetchCookie`，总超时 120 秒）。如果后端在用户未登录时返回特定状态（如空 cookie 或 404），则继续轮询；如果返回有效 cookie 则结束。

### Step 3: 创建 `src/components/W3LoginFlow.tsx` — 登录 UI 组件

新建 Ink/React 组件，参考现有 `ConsoleOAuthFlow.tsx` 的模式：

**状态机**: `idle` → `logging_in` → `success` | `error`

**UI 渲染**:
- `idle`: 显示 "w3登录" 选项（可选中），底部提示 "按 Q 取消"
- `logging_in`: 显示 Spinner + "正在登录..."
- `success`: 短暂显示 "登录成功"，然后调用 `onDone()`
- `error`: 显示 "用户登录失败，失败原因: {error.message}"

**交互**:
- 使用 `useInput` hook 监听键盘，Q 键触发 `process.exit(0)`
- 选中 "w3登录" 后调用 `w3Login()`，成功后调用 `saveUserInfo()` 写入文件

**Props**: `{ onDone: () => void }`

**复用现有组件**：
- `Dialog` from `src/components/design-system/Dialog.tsx`
- `Spinner` from `src/components/Spinner.tsx`（如果存在）或 Ink 内置 Spinner
- `Text`, `Box` from `src/ink.js`

### Step 4: 修改 `src/main.tsx` — 添加 `--login` 参数 + 登录检查

**4a. 添加 CLI 参数**（约 line 993 附近的 `.option()` 链中）:

```typescript
.option('--login', 'Force w3 login')
```

**4b. 在 `showSetupScreens()` 调用之前插入 w3 登录检查**（约 line 2239 附近）:

```typescript
// W3 Login check — before showSetupScreens
const { hasValidUserInfo } = await import('./utils/w3UserInfo.js')
const forceLogin = (options as any).login === true
if (forceLogin || !hasValidUserInfo()) {
  const { W3LoginFlow } = await import('./components/W3LoginFlow.js')
  await showSetupDialog(root, (done) => (
    <W3LoginFlow onDone={() => done()} />
  ))
}
```

这个位置在 Ink root 创建之后、`showSetupScreens()` 之前，确保用户先完成认证再进入信任对话框等后续流程。

### Step 5: 修改 `src/commands/login/login.tsx` — 替换 `/login` 命令

将 `Login` 组件中的 `ConsoleOAuthFlow` 替换为 `W3LoginFlow`：

```tsx
import { W3LoginFlow } from '../../components/W3LoginFlow.js'

export function Login(props: { onDone: (success: boolean) => void }) {
  return (
    <Dialog title="w3登录" onCancel={() => props.onDone(false)} color="permission">
      <W3LoginFlow onDone={() => props.onDone(true)} />
    </Dialog>
  )
}
```

简化 `call()` 函数，移除 Anthropic 特有的 post-login 逻辑（GrowthBook、trusted device、policy limits 等），因为 w3 登录不需要这些。

### Step 6: 修改 `src/cli/handlers/auth.ts` — 替换 `auth login` 子命令

替换 `authLogin()` 函数为 w3 登录流程（非交互式，直接在终端输出）：

```typescript
export async function authLogin(): Promise<void> {
  const { w3Login } = await import('../../services/w3auth/index.js')
  const { saveUserInfo } = await import('../../utils/w3UserInfo.js')
  const result = await w3Login()
  saveUserInfo(result)
  process.stdout.write('登录成功\n')
  process.exit(0)
}
```

### Step 7: 修改 `src/main.tsx` — 简化 `auth login` 命令定义

在 line 4101 附近，移除 OAuth 特有的选项（`--email`, `--sso`, `--console`, `--claudeai`）：

```typescript
auth.command('login')
  .description('Sign in via w3 SSO')
  .action(async () => {
    const { authLogin } = await import('./cli/handlers/auth.js')
    await authLogin()
  })
```

### Step 8: 修改 `src/utils/auth.ts` — 添加 w3 认证源

在 `getAuthTokenSource()` 函数顶部添加 w3 userinfo 检查，使其成为最高优先级的认证源：

```typescript
const { getUserInfo } = await import('./w3UserInfo.js')
const w3Info = getUserInfo()
if (w3Info?.token) {
  return { source: 'w3_sso', hasToken: true }
}
```

注意：如果 `getAuthTokenSource()` 是同步函数，需要用同步 import 或在模块顶部 import。

---

## 关键文件清单

| 操作 | 文件路径 |
|------|---------|
| 新建 | `src/utils/w3UserInfo.ts` |
| 新建 | `src/services/w3auth/index.ts` |
| 新建 | `src/components/W3LoginFlow.tsx` |
| 修改 | `src/main.tsx` (添加 --login 参数 + 登录检查) |
| 修改 | `src/commands/login/login.tsx` (替换 OAuth 为 W3) |
| 修改 | `src/cli/handlers/auth.ts` (替换 authLogin) |
| 修改 | `src/utils/auth.ts` (添加 w3 认证源) |

---

## 验证方式

1. `bun run build:dev` 确认编译通过
2. `./cli-dev --login` 验证强制登录流程：弹出登录面板 → 点击 w3 登录 → 浏览器打开 → 完成登录 → 写入 .userinfo.json → 进入应用
3. 删除 `~/.cache/freecode/.userinfo.json` 后运行 `./cli-dev`，验证自动触发登录
4. `.userinfo.json` 存在时运行 `./cli-dev`，验证直接进入应用不触发登录
5. 登录面板按 Q 键，验证进程退出
6. 断网或使用无效 session_id 测试错误提示
