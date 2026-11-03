# dsh-higress-ai-route-plugin

这是一个可安装的 Harness Bundle，用于把官方 `dsh-llm-pi-ai` Provider 连接到 Higress AI 网关路由。

插件按 Cordis 和 Settings 插件规范从零实现，不复制或修改 Harness 应用本体；Bundle 只贡献一个 Host 插件和一个 Browser 设置卡片。

完整的构建、安装、配置、验证、升级和故障排查步骤见 [Harness 路由插件部署安装手册](./DEPLOYMENT.zh.md)。

对于任意 Harness 源码部署，可直接运行 [`scripts/install-native-harness.sh`](./scripts/install-native-harness.sh)：脚本会使用锁定依赖构建插件，通过原生 `dsh plugin` CLI 安装到指定 profile，并且不会保存 Console 密码或网关凭证。

## 克隆并安装

推荐把本仓库克隆到指定目录，再对已有 Harness 源码 checkout 执行一键安装。`PROFILE` 必须是已经存在的 Harness profile；脚本不会创建 profile，也不会替你选择运行中的 Web 实例。

### 先搞清楚两个目录

安装时一定会用到两个不同的目录，不能把它们填成同一个路径：

| 名称 | 含义 | 目录中应该有什么 | 示例 |
| --- | --- | --- | --- |
| 插件目录 | 从本 GitHub 仓库 clone 出来的 `harness-gateway01` 目录；这里执行 `npm` 命令 | `package.json`、`scripts/`、`src/` | `/Users/你的用户名/harness-plugins/harness-gateway01` |
| Harness 源码目录 | Harness 主仓库的源码 checkout 根目录；这里执行 `pnpm dsh` 命令 | `package.json`、`apps/cli/src/bin.ts`、`apps/` | `/Users/你的用户名/harness` |

目录关系应当类似下面这样。`harness-gateway01` 和 `harness` 是两个并列目录，不是父子目录：

```text
/Users/你的用户名/
├── harness-plugins/
│   └── harness-gateway01/   ← 插件目录：npm ci、npm run build、npm pack
└── harness/                 ← Harness 源码目录：pnpm dsh plugin ... add
```

`PROFILE` 不是目录路径，而是 Harness 中已经存在的 profile 名称，例如 `web`。如果你不知道 profile 名称，可在 Harness 源码目录执行 `pnpm dsh profile list`（以当前 Harness 版本支持的命令为准）或查看现有 `.dsh/profiles/` 目录。

```bash
PLUGIN_ROOT="$HOME/harness-plugins"
HARNESS_SRC="$HOME/harness"
PROFILE="<existing-profile>"

mkdir -p "$PLUGIN_ROOT"
git clone https://github.com/zhaozhiyue1987/harness-gateway01.git \
  "$PLUGIN_ROOT/harness-gateway01"
cd "$PLUGIN_ROOT/harness-gateway01"
HARNESS_SRC="$HARNESS_SRC" PROFILE="$PROFILE" \
  ./scripts/install-native-harness.sh
```

脚本会完成依赖检查、构建、测试、临时打包和 Harness 原生 CLI 安装。安装后请重启所选 profile 对应的 Harness Web 进程；Console 地址和路由凭证在插件页面中配置，仓库不会读取或保存业务密钥。

如果你不知道 Harness 源码目录是哪一个，不要猜路径。进入你认为的 Harness 目录后执行：

```bash
test -f "$HARNESS_SRC/package.json" && \
test -f "$HARNESS_SRC/apps/cli/src/bin.ts" && \
echo "这是 Harness 源码目录：$HARNESS_SRC"
```

只有打印出确认信息，`HARNESS_SRC` 才填写正确。

## 用户流程

1. 使用 `dsh plugin --profile <name> add <package-or-tarball>` 安装。
2. 打开“设置 → 插件 → Higress AI 路由”。
3. 输入 Console 管理地址、用户名和密码。地址支持私有化 HTTP(S) 地址，也支持反向代理路径前缀。
4. 选择 `GET /v1/ai/callable-routes` 返回的路由。
5. `BEARER` 路由首次使用时输入已有路由凭证；无认证路由使用固定兼容凭证 `higress-no-auth`。
6. Host 将一个 Provider 配置写入官方 `llm-pi-ai` 设置命名空间，数据面继续走普通 OpenAI 兼容协议，Harness 使用原生响应中的 `usage` 记录 Token 消耗。

## 原生 Harness 一键安装

脚本不会创建 profile，也不会代填业务凭证；目标 profile 必须已经存在。首次安装示例：

```bash
HARNESS_SRC="$HOME/harness" PROFILE="<existing-profile>" \
  ./scripts/install-native-harness.sh
```

脚本执行 `npm ci`、类型检查、Bundle 构建、单元测试和 `npm pack`，然后执行：

```bash
pnpm -s --dir "$HARNESS_SRC" dsh plugin --profile "$PROFILE" add <generated-tarball>
```

安装完成后必须重启正在运行的 Harness Web 进程；若使用 systemd，可设置 `RESTART_SERVICE=always` 并提供有权限的 `dsh-harness` 服务。

## 设置页交互

- 使用 Harness 原生设置页的卡片宽度、间距、圆角、边框和语义状态色，不引入独立主题或覆盖全局样式。
- 登录区提供私有化地址说明、自动填充提示、密码显隐和明确的加载态；密码、Cookie 和路由凭证不会渲染到 Remote 状态。
- 路由列表展示协议、模型、认证方式、可用状态和当前选中态；选中路由会展示最终调用地址、模型 ID 和认证传输类型，但不展示密钥。
- 自动刷新支持 15–3600 秒的间隔配置，显示最近一次同步时间；路由为空、同步异常和操作失败均提供语义化状态与可恢复操作。
- 页面控件使用原生表单语义、标签关联、`aria-live`/`role="alert"` 和键盘可操作按钮，便于 Harness 的无障碍交互和后续主题适配。

网关返回的 `OPENAI_CHAT_COMPLETIONS` 协议会转换为官方 Provider 要求的
`openai-completions`。Provider ID 由网关实例和路由 ID 共同生成，因此不同私有化网关的同名路由不会互相覆盖；如果后台更换了绑定凭证 ID，profile 中的凭证引用也会变化，插件会再次要求输入已有密钥。

## 手工构建和安装

下面按“小白可以照着执行”的方式说明。终端可以从任意目录开始，但不要跳过任何 `cd` 命令。插件构建和 Harness 安装必须在两个不同目录中执行。

### 第 1 步：设置三个路径

可以从任意目录执行。请把示例值改成真实路径：`PLUGIN_ROOT` 是插件仓库的父目录，`HARNESS_SRC` 是 Harness 源码 checkout 根目录，`PROFILE` 是已经存在的 Harness profile 名称。

```bash
PLUGIN_ROOT="$HOME/harness-plugins"
HARNESS_SRC="$HOME/harness"
PROFILE="web"
```

不要保留 `<existing-profile>`。如果实际 profile 不是 `web`，请替换为实际名称。

### 第 2 步：确认 Harness 源码目录

可以从任意目录执行。命令必须成功并打印确认信息：

```bash
test -f "$HARNESS_SRC/package.json" && \
test -f "$HARNESS_SRC/apps/cli/src/bin.ts" && \
echo "Harness 源码目录正确：$HARNESS_SRC"
```

如果失败，请把 `HARNESS_SRC` 改成同时包含 `package.json` 和 `apps/cli/src/bin.ts` 的目录后重试。

### 第 3 步：克隆插件并进入插件目录

可以从任意目录执行：

```bash
mkdir -p "$PLUGIN_ROOT"
git clone https://github.com/zhaozhiyue1987/harness-gateway01.git \
  "$PLUGIN_ROOT/harness-gateway01"
cd "$PLUGIN_ROOT/harness-gateway01"
pwd
```

最后的 `pwd` 必须显示以 `harness-gateway01` 结尾的路径。下一步所有 `npm` 命令都必须在这个目录执行。

### 第 4 步：在插件目录构建和测试

保持当前目录为 `"$PLUGIN_ROOT/harness-gateway01"`，逐条执行：

```bash
npm ci
npm run typecheck
npm run build
npm test
npm pack
```

预期结果：类型检查和测试退出码为 0；构建生成 `dist/`；`npm pack` 在当前插件目录生成 `dsh-higress-ai-route-plugin-0.1.1.tgz`。

确认安装包存在：

```bash
ls -lh dsh-higress-ai-route-plugin-0.1.1.tgz
```

### 第 5 步：切换到 Harness 源码目录

这是最容易出错的一步。下一条安装命令不能在插件目录执行：

```bash
cd "$HARNESS_SRC"
pwd
```

最后的 `pwd` 必须显示 Harness 源码 checkout 路径，不能以 `harness-gateway01` 结尾。

### 第 6 步：把安装包安装到已有 profile

保持当前目录为 `"$HARNESS_SRC"`，执行：

```bash
pnpm dsh plugin --profile "$PROFILE" add \
  "file:$PLUGIN_ROOT/harness-gateway01/dsh-higress-ai-route-plugin-0.1.1.tgz"
```

该命令只把插件安装到指定 profile，不会创建 profile，也不会配置 Console 密码或网关凭证。

### 第 7 步：重启 Harness Web 并验证

按照目标环境原有方式重启 Harness Web。启动后进入 Harness 的“设置 → 插件”，确认看到“**Higress AI 路由**”。确认插件卡片出现后，再在插件页面填写 Console 地址和路由凭证。

如果希望一条命令完成构建和安装，请先完成第 1～3 步并保持当前目录在插件目录，然后执行：

```bash
HARNESS_SRC="$HARNESS_SRC" PROFILE="$PROFILE" \
  ./scripts/install-native-harness.sh
```

## 安全边界

- 浏览器永远拿不到 Console Cookie、密码和 API Key。
- Host 通过 `ctx.credentials` 保存 Console Cookie 和路由凭证；Settings 与 Remote 状态不包含明文秘密。
- 插件不创建或管理网关凭证；`BEARER` 值只是用户已有路由凭证在 Harness profile 中的副本。
- `HEADER` 和 `QUERY` 路由仍可查看，但一期标记为不可连接。
- 退出登录只删除插件拥有的 Provider 配置和 Cookie 引用。
- 使用插件的 profile 需要包含官方 `@deepseek-ai/dsh-llm-pi-ai` Provider；插件只写入它的标准设置命名空间，不替换官方适配器。

## 网关契约

- `POST /session/login`
- `GET /v1/ai/callable-routes`
- `GET /v1/ai/callable-routes/{routeId}`，支持 ETag/304
- 数据面使用 OpenAI 兼容协议并回传原生 `usage`

不需要新增 scoped usage API 或回调链路。
