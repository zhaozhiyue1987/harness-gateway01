#!/usr/bin/env bash
set -Eeuo pipefail

# Install this bundle into an existing native DeepSeek Harness profile.
# The script builds the plugin locally, installs the resulting tarball through
# the supported `dsh plugin` command, and never writes credentials to disk.

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HARNESS_SRC="${HARNESS_SRC:-}"
PROFILE="${PROFILE:-web}"
SKIP_TESTS="${SKIP_TESTS:-0}"
RESTART_SERVICE="${RESTART_SERVICE:-auto}"
SERVICE_NAME="${SERVICE_NAME:-dsh-harness}"

log() { printf '[harness-gateway01] %s\n' "$*"; }
die() { printf '[harness-gateway01:error] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法：
  HARNESS_SRC=/opt/dsh/harness PROFILE=web \
    ./scripts/install-native-harness.sh

必填：
  HARNESS_SRC  DeepSeek Harness 源码目录（包含 package.json 和 apps/cli）

可选环境变量：
  PROFILE          已存在的 Harness profile，默认 web
  SKIP_TESTS       设为 1 跳过 typecheck/test（不建议）
  RESTART_SERVICE  auto|always|never，默认 auto
  SERVICE_NAME     systemd 服务名，默认 dsh-harness
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

[[ -n "$HARNESS_SRC" ]] || { usage; die '请先设置 HARNESS_SRC'; }
[[ -d "$HARNESS_SRC" ]] || die "Harness 目录不存在：$HARNESS_SRC"
[[ -f "$HARNESS_SRC/package.json" ]] || die "不是 Harness 源码目录：$HARNESS_SRC"
[[ -f "$HARNESS_SRC/apps/cli/src/bin.ts" ]] || die "缺少 Harness 原生 CLI：$HARNESS_SRC/apps/cli/src/bin.ts"

for command_name in node npm tar; do
  command -v "$command_name" >/dev/null 2>&1 || die "缺少命令：$command_name"
done

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 19)) process.exit(1)' \
  || die "Node.js 版本过低，需要 >=22.19.0，当前为 $(node -v)"

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  die '缺少 pnpm 或 corepack；请按 Harness packageManager 安装 pnpm@11.28.5'
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

log "插件目录：$PLUGIN_DIR"
log "Harness：$HARNESS_SRC（profile=$PROFILE）"

cd "$PLUGIN_DIR"
log '安装锁定依赖'
npm ci --ignore-scripts

if [[ "$SKIP_TESTS" != '1' ]]; then
  log '运行类型检查'
  npm run typecheck
fi

log '构建插件 Bundle'
npm run build

if [[ "$SKIP_TESTS" != '1' ]]; then
  log '运行单元测试'
  npm test
fi

log '打包并安装到 Harness profile'
TARBALL="$(npm pack --silent --pack-destination "$TMP_DIR")"
(cd "$HARNESS_SRC" && "${PNPM[@]}" -s dsh plugin --profile "$PROFILE" add "$TMP_DIR/$TARBALL")

case "$RESTART_SERVICE" in
  never)
    log 'RESTART_SERVICE=never，跳过服务重启'
    ;;
  always)
    command -v systemctl >/dev/null 2>&1 || die 'RESTART_SERVICE=always 需要 systemctl'
    sudo systemctl restart "$SERVICE_NAME"
    ;;
  auto)
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME"; then
      sudo systemctl restart "$SERVICE_NAME"
      log "已重启 systemd 服务：$SERVICE_NAME"
    else
      log "未自动重启服务；请按运行方式重启 Harness（例如 systemctl restart $SERVICE_NAME）"
    fi
    ;;
  *)
    die 'RESTART_SERVICE 只支持 auto|always|never'
    ;;
esac

log "安装完成：$TARBALL"
log '验证：打开 Harness 的“设置 → 插件”，确认 Higress AI 路由卡片已加载。'
