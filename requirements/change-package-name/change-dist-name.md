# 需求：重命名构建产物

## 背景

当前构建产物名称为 `cli` / `cli-dev`，需要统一重命名为 `hac-claudecode` 系列，以体现项目品牌。核心挑战是 `build:dev` 和 `build:dev:full` 当前共用同一个产物名 `cli-dev`，现在需要区分为不同名称。

## 名称映射

| 命令 | 当前产物 | 新产物 |
|---|---|---|
| `bun run build` | `./cli` | `./hac-claudecode` |
| `bun run build:dev` | `./cli-dev` | `./hac-claudecode-dev` |
| `bun run build:dev:full` | `./cli-dev` | `./hac-claudecode-dev-ff` |
| `bun run compile` | `./dist/cli` | `./dist/hac-claudecode` |
| `bun run compile --dev` | `./dist/cli-dev` | `./dist/hac-claudecode-dev` |
| `bun run compile --dev --feature-set=dev-full` | `./dist/cli-dev` | `./dist/hac-claudecode-dev-ff` |

## 实施步骤

### 1. `scripts/build.ts` — 构建脚本（核心改动）

**a) 新增 `--feature-set=dev-full` 的检测变量（约第 83-99 行附近）：**

在解析 `--feature-set` 参数时，新增一个 `devFull` 布尔变量来标记是否为 dev-full 构建：

```ts
let devFull = false
// 在解析 --feature-set=dev-full 的两个分支中，都加上：
devFull = true
```

**b) 修改产物路径逻辑（第 112-118 行）：**

```ts
const outfile = compile
  ? dev
    ? devFull ? './dist/hac-claudecode-dev-ff' : './dist/hac-claudecode-dev'
    : './dist/hac-claudecode'
  : dev
    ? devFull ? './hac-claudecode-dev-ff' : './hac-claudecode-dev'
    : './hac-claudecode'
```

### 2. `package.json` — bin 字段（第 9-10 行）

```json
"bin": {
  "claude": "./hac-claudecode",
  "claude-source": "./hac-claudecode"
}
```

scripts 本身不需要改，因为它们调用的是 `scripts/build.ts` 而非直接引用产物名。

### 3. `CLAUDE.md` — 文档（第 11-27 行）

更新所有产物名称引用：
- `./cli` → `./hac-claudecode`
- `./cli-dev` → `./hac-claudecode-dev`
- `./dist/cli` → `./dist/hac-claudecode`
- `build:dev:full` 的注释改为 `(./hac-claudecode-dev-ff)`
- 第 27 行运行说明更新

### 4. `README.md` — 文档（第 181-223 行区域）

更新表格和所有使用示例中的产物名称：
- `./cli` → `./hac-claudecode`
- `./cli-dev` → `./hac-claudecode-dev` / `./hac-claudecode-dev-ff`
- `./dist/cli` → `./dist/hac-claudecode`

### 5. `FEATURES.md` — 文档（第 19-25 行）

同上，更新所有产物名称引用。

### 6. `install.sh` — 安装脚本（第 126、133、177 行）

- 第 126 行：`cli-dev` → `hac-claudecode-dev-ff`（install.sh 使用 `build:dev:full`）
- 第 133 行：symlink 源 `cli-dev` → `hac-claudecode-dev-ff`
- 第 177 行：显示路径 `cli-dev` → `hac-claudecode-dev-ff`

## 需修改的文件清单

1. `scripts/build.ts` — 核心构建逻辑
2. `package.json` — bin 字段
3. `CLAUDE.md` — 项目文档
4. `README.md` — 项目文档
5. `FEATURES.md` — 特性文档
6. `install.sh` — 安装脚本

## 验证方式

1. `bun run build` → 确认生成 `./hac-claudecode`，可执行
2. `bun run build:dev` → 确认生成 `./hac-claudecode-dev`，可执行
3. `bun run build:dev:full` → 确认生成 `./hac-claudecode-dev-ff`，可执行
4. `bun run compile` → 确认生成 `./dist/hac-claudecode`，可执行
5. 检查各文档中不再有旧名称 `./cli`、`./cli-dev`、`./dist/cli` 的残留引用
