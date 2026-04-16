# 登录系统分析

## 概述

本文档分析代码库中的登录/认证系统实现。该系统支持多种认证方式：OAuth（Claude.ai 和 Console）、API Key、企业 IdP（XAA）以及第三方服务。

---

## 核心架构

### 入口点
- **`src/commands/login/login.tsx`**：主登录命令 UI 组件
  - `Login` 组件包装了一个包含 `ConsoleOAuthFlow` 的 `Dialog`
  - 登录成功后触发登录后刷新逻辑（设置、策略限制、GrowthBook、受信任设备注册等）

### OAuth 流程组件
- **`src/components/ConsoleOAuthFlow.tsx`**：中央 OAuth 流程状态机
  - 状态：`idle` → `ready_to_start` → `waiting_for_login` → `creating_api_key` → `success/error`
  - 支持两种登录路径：
    1. **Claude.ai 认证**（基于订阅）
    2. **Console 认证**（API 使用量计费）
  - 支持两种授权码获取方式：
    - **自动**：打开浏览器，监听本地主机回调
    - **手动**：用户复制粘贴授权码

### OAuth 服务
- **`src/services/oauth/index.ts`**：`OAuthService` 类
  - 实现 OAuth 2.0 授权码流程与 PKCE
  - 管理本地回调服务器的 `AuthCodeListener`
  - 生成 PKCE code verifier/challenge 和 state 参数
  - 支持 `skipBrowserOpen` 选项用于 SDK 控制协议

### 认证处理器
- **`src/cli/handlers/auth.ts`**：CLI 认证命令处理器
  - `authLogin()`：主登录入口
  - `installOAuthTokens()`：共享的获取令牌后逻辑（保存令牌、获取 profile/roles）
  - `authStatus()`：检查当前认证状态
  - `authLogout()`：登出处理器
  - 通过 `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` 环境变量实现非交互式快速登录

### 企业 IdP 登录（XAA）
- **`src/services/mcp/xaaIdpLogin.ts`**：企业 IdP 的跨代理认证
  - OIDC authorization_code + PKCE 流程
  - `acquireIdpIdToken()`：从 IdP 获取 id_token 的主函数
  - `getCachedIdpIdToken()`：从安全存储读取缓存的 id_token
  - `saveIdpIdToken()`：将 id_token 保存到 Keychain
  - `discoverOidc()`：通过 `.well-known/openid-configuration` 进行 OIDC 发现
  - `waitForCallback()`：用于授权码回调的本地 HTTP 服务器
  - 超时：登录 5 分钟，单次请求 30 秒
  - 令牌过期缓冲：过期前 60 秒

---

## 认证方式

| 方式 | 描述 | 令牌存储 |
|------|------|---------|
| OAuth (Claude.ai) | 通过 claude.ai 的基于订阅认证 | 安全存储 + API Key 创建 |
| OAuth (Console) | 通过 Anthropic Console 的 API 使用量计费 | 安全存储 |
| API Key | 直接使用 `ANTHROPIC_API_KEY` 环境变量 | 环境变量 |
| XAA 企业 IdP | 基于 OIDC 的企业身份提供商 | Keychain（缓存的 id_token） |
| 第三方 (Codex) | OpenAI Codex 或类似提供商 | 专用 OAuth 令牌槽位 |

---

## 关键组件

### `OAuthTokens` 结构
```typescript
{
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: { uuid, emailAddress, organizationUuid }
}
```

### 登录后操作（成功时）
1. 重置成本状态
2. 刷新远程托管设置
3. 刷新策略限制
4. 重置用户缓存
5. 刷新 GrowthBook 功能标志
6. 清除受信任设备令牌
7. 注册为受信任设备
8. 重置绕过权限检查
9. 增加 `authVersion` 以触发重新获取认证相关数据

---

## 安全存储

- 使用 `src/utils/secureStorage/index.js` 中的 `getSecureStorage()`
- XAA IdP 令牌存储在 `mcpXaaIdp` 键下
- XAA IdP 客户端密钥存储在 `mcpXaaIdpConfig` 键下
- Issuer 规范化：去除尾部斜杠，小写主机名

---

## 文件结构

```
src/
├── commands/login/
│   ├── login.tsx          # 登录命令 UI
│   └── index.ts
├── components/
│   └── ConsoleOAuthFlow.tsx  # OAuth 状态机 UI
├── services/
│   ├── oauth/
│   │   ├── index.ts       # OAuthService 类
│   │   ├── client.ts      # OAuth API 调用
│   │   ├── crypto.ts      # PKCE 工具
│   │   └── types.ts       # 类型定义
│   └── mcp/
│       └── xaaIdpLogin.ts # 企业 IdP 登录
└── cli/handlers/
    └── auth.ts            # 认证命令处理器
```

---

## 环境变量

| 变量 | 用途 |
|------|------|
| `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` | 跳过 OAuth 流程，直接交换 refresh token |
| `CLAUDE_CODE_OAUTH_SCOPES` | 使用 refresh token 时的必需作用域 |
| `ANTHROPIC_API_KEY` | 直接 API Key 认证 |
| `CLAUDE_CODE_ENABLE_XAA` | 启用企业 IdP（XAA）登录 |
