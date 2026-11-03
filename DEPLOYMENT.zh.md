# Harness Higress AI 路由插件部署安装手册

本文适用于 `dsh-higress-ai-route-plugin` 0.1.x，在任意具备原生 Harness 源码 checkout 的目标环境中安装、配置和验证 Higress AI 网关路由。

## 0. 从 GitHub 克隆并一键安装

以下流程不依赖特定主机、端口或 profile 名称。请把 `PLUGIN_ROOT`、`HARNESS_SRC` 和 `PROFILE` 改为目标环境的实际值；`PROFILE` 必须已经存在。

```bash
PLUGIN_ROOT="/opt/harness-plugins"
HARNESS_SRC="/opt/harness"
PROFILE="<existing-profile>"

mkdir -p "$PLUGIN_ROOT"
git clone https://github.com/zhaozhiyue1987/harness-gateway01.git \
  "$PLUGIN_ROOT/harness-gateway01"
cd "$PLUGIN_ROOT/harness-gateway01"
HARNESS_SRC="$HARNESS_SRC" PROFILE="$PROFILE" \
  ./scripts/install-native-harness.sh
```

脚本会在插件仓库内执行锁定依赖安装、类型检查、构建、测试和临时打包，再通过 Harness 源码 checkout 的原生 CLI 安装到指定 profile。安装后重启该 profile 对应的 Harness Web 进程。脚本不创建 profile，也不读取或保存 Console、路由或模型密钥。

## 1. 部署架构

插件分为两个连接方向：

```text
Harness 插件 Host ──登录/拉取路由──> Higress Console 管理入口
Harness 官方 LLM Provider ──OpenAI 兼容请求──> Higress Gateway 数据入口
```

目标环境的统一入口示例：

| 用途 | 地址示例 |
| --- | --- |
| Harness 插件登录和路由同步 | `https://console.example.com` |
| Harness 实际 AI 调用 | `https://gateway.example.com` |
| Harness Web | `https://harness.example.com` |

生产环境请将这两个地址替换为 Console 和 Gateway 的稳定 VIP、负载均衡地址或 DNS，不能把某一台节点地址当成长期入口。

> 当前插件支持“统一入口分流到三节点”模式；不负责在无 VIP 场景下维护三个节点地址并自动切换。

## 2. 前置条件

- 已部署并启动 Harness Web 服务。
- 已部署 Higress Console 和 Gateway，并确认管理入口可访问。
- Node.js `>=22.19.0`。
- npm 可用。
- Harness CLI `dsh` 版本满足插件要求：`>=0.2.0-rc.0 <0.3.0`。
- 使用的 Harness profile 已包含官方 `@deepseek-ai/dsh-llm-pi-ai` Provider。
- 网关已配置可调用路由；一期支持无认证和 `BEARER` 两种认证方式。

先检查目标环境工具：

```sh
node --version
npm --version
command -v dsh
dsh --version
```

如果 `dsh` 不在当前 Shell 的 `PATH` 中，请使用安装 Harness CLI 时的终端环境执行后续命令。

## 3. 配置网关公共地址

插件拉取的路由配置会包含最终数据面地址。网关公共地址应配置为 Gateway 的统一入口，只填写协议、主机和端口，不要填写路由前缀。

示例：

```text
https://gateway.example.com
```

如果路由前缀为 `/aaa`，插件最终会显示并写入 Provider：

```text
   https://gateway.example.com/aaa/v1
```

生产示例：

```text
https://gateway.example.com
```

配置完成后，可在 Console 的系统设置中确认 Gateway Public URL；修改公共地址后，插件会在下一次刷新时根据新的 `configVersion` 更新 Provider。

## 4. 构建插件安装包

进入已克隆的插件仓库：

```sh
cd "$PLUGIN_ROOT/harness-gateway01"
```

安装依赖并执行检查：

```sh
npm ci
npm run typecheck
npm run build
npm test
npm pack
```

正常情况下会生成类似文件：

```text
dsh-higress-ai-route-plugin-0.1.1.tgz
```

可以检查安装包是否包含构建产物：

```sh
tar -tzf dsh-higress-ai-route-plugin-0.1.1.tgz | sed -n '1,80p'
```

安装包应至少包含 `dist/`、`cordis.patch.yml`、`package.json` 和 README 文件。

## 5. 安装到 Harness profile

将 `<profile-name>` 替换为实际使用的 Harness profile：

```sh
cd "$HARNESS_SRC"
pnpm dsh plugin --profile "$PROFILE" add \
  "file:$PLUGIN_ROOT/harness-gateway01/dsh-higress-ai-route-plugin-0.1.1.tgz"
```

安装后确认 profile 的 `package.json` 中包含：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-higress-ai-route-plugin"
      ]
    }
  },
  "dependencies": {
    "dsh-higress-ai-route-plugin": "file:/path/to/dsh-higress-ai-route-plugin-0.1.1.tgz"
  }
}
```

按照当前 Harness 启动方式重启或重新构建该 profile，然后刷新浏览器页面。插件不会修改 Harness 应用本体，也不会覆盖官方 LLM Provider。

## 6. 在 Harness 中完成配置

1. 打开 `https://harness.example.com/` 或目标 Harness 地址。
2. 进入“设置 → 插件 → 内置插件”。
3. 搜索“**Higress AI 路由**”。
4. 填写 Console 管理地址，例如：

   ```text
   https://console.example.com
   ```

   如果 Console 部署在反向代理路径下，可以填写带路径前缀的地址，例如：

   ```text
   https://console.example.com/higress
   ```

5. 输入 Console 用户名和密码并登录。
6. 从路由列表中选择需要使用的路由。
7. 根据路由认证方式完成配置：

   - 无认证：插件使用固定兼容凭证 `higress-no-auth`。
   - `BEARER`：输入该路由已有的 Bearer 凭证，插件只在 Harness profile 中保存副本。
   - `HEADER`、`QUERY`：一期可显示但不可连接。

8. 如果后台没有指定 Model ID，插件使用固定默认值 `higress-default-model`。
9. 按需开启自动刷新，刷新间隔支持 15–3600 秒。

插件会将选中的路由写入官方 `llm-pi-ai` Provider 设置。Cookie、密码和凭证不会进入浏览器 Remote 状态。

## 7. 功能验证

### 7.1 路由同步验证

- 页面能看到路由名称、协议、模型和认证方式。
- 选中路由后能看到最终调用地址，例如 `https://gateway.example.com/aaa/v1`。
- 页面显示“已连接”或等价成功状态。

### 7.2 Harness 对话验证

新建 Harness 会话并发送一条简单消息，确认：

- 请求成功返回；
- 使用的是刚才选中的网关路由；
- Harness 底部能显示 Token 消耗；
- 网关链路追踪和实例监控能看到对应请求。

Token 用量由 OpenAI 兼容响应中的原生 `usage` 字段和网关观测链路提供，不需要插件额外调用 scoped usage API 或回调接口。

### 7.3 自动刷新验证

1. 在网关后台修改路由的模型、前缀或绑定凭证。
2. 等待自动刷新周期，或点击“立即刷新”。
3. 确认插件中的路由配置和 Provider 已更新。
4. 如果绑定凭证 ID 发生变化，插件会要求重新输入已有的 Bearer 凭证。

### 7.4 三节点验证

在有 HAProxy、VIP 或负载均衡的环境中：

1. 停止一个 Gateway 副本。
2. 发起新的 Harness 对话请求。
3. 确认请求由其他 Gateway 副本继续处理。
4. 停止一个 Console 副本。
5. 刷新插件路由列表，确认管理入口仍可用。

注意：插件不静默重放已经发送的 AI Chat POST 请求；在请求已经发出或开始流式返回后发生节点故障，应由 Harness 展示失败并由用户重新发起。

## 8. 升级、回滚和卸载

### 升级

构建新版本安装包后，使用新 tarball 重复执行安装命令：

```sh
dsh plugin --profile <profile-name> add \
  "/path/to/dsh-higress-ai-route-plugin-<new-version>.tgz"
```

重启或重新构建 profile 后刷新 Harness 页面。升级通常保留当前插件设置和已保存凭证。

### 回滚

使用上一版本 tarball 重复安装，并重启或重新构建 profile。如果 Provider 配置结构发生变化，建议先在插件页面退出登录，再重新登录并选择路由。

### 卸载

优先使用 Harness CLI 的插件移除命令：

```sh
dsh plugin --profile <profile-name> remove dsh-higress-ai-route-plugin
```

如果当前 CLI 版本没有 `remove` 子命令，则从目标 profile 的 `package.json` 删除该插件依赖和 bundle 项，再按原 profile 构建/启动方式重新部署。卸载后，在插件页面退出登录可清理插件拥有的 Provider 配置和 Cookie 引用。

## 9. 常见问题

### 插件安装后在 Harness 中找不到

- 确认安装命令使用的是当前运行 Harness 的 profile。
- 确认 profile 的 `package.json` 同时包含 bundle 和 dependency。
- 确认已经重新构建或重启 profile，并刷新浏览器。
- 在“内置插件”中搜索完整名称“**Higress AI 路由**”。

### 登录返回 `Missing user name or password`

检查请求 JSON 是否使用 ASCII 半角双引号。不要复制弯引号或全角引号：

```sh
curl -i -c /tmp/higress-console-test.cookies \
  -H 'Content-Type: application/json' \
  --data '{"username":"admin","password":"<password>","autoLogin":true}' \
  'https://console.example.com/session/login'
```

### 路由列表为空或路由不可连接

检查：

- Console 管理地址是否正确；
- Gateway Public URL 是否已经配置；
- 路由是否启用；
- 路由是否使用了一期不支持的 `HEADER` 或 `QUERY` 认证；
- 网关是否能访问对应上游模型。

### 返回 401/403

Console 会话已过期或权限不足。点击退出登录后重新登录，并确认当前用户能查看目标路由。

### 路由请求 404

检查公共地址和路由前缀是否重复配置。Gateway Public URL 只填写主机和端口，`/aaa` 等前缀由网关路由配置生成。

### 自动刷新失败

先点击手动刷新；如果仍失败，查看插件显示的错误状态。插件会进入 `REAUTH_REQUIRED` 或 `SYNC_DEGRADED`，不会清除已有 Provider 配置。

### 页面出现 HMR 或事务嵌套提示

开发模式热更新期间可能出现一次性提示。重启 Harness profile 并刷新浏览器后再验证；这不等同于网关路由配置错误。

## 10. 生产部署检查清单

- [ ] Console 使用稳定 VIP/LB/DNS，插件不直连单个 Console 节点。
- [ ] Gateway Public URL 指向稳定数据面入口。
- [ ] 生产环境使用 HTTPS 和有效证书。
- [ ] Console 副本共享数据库、会话密钥和权限状态。
- [ ] Gateway 副本配置一致，并由入口执行健康检查。
- [ ] 已验证 Gateway 副本故障、Console 副本故障和路由配置变更。
- [ ] 已验证 Token 用量、链路追踪和实例监控数据正常。
- [ ] 未将密码、Cookie 或 Bearer 凭证提交到 Git 或写入 URL。
