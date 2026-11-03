# dsh-higress-ai-route-plugin

An installable Harness bundle for connecting the official `dsh-llm-pi-ai` provider to a Higress AI gateway route.

The plugin is intentionally implemented as a new standalone project. It does not copy or patch the Harness application. The bundle contributes one Host plugin and one Browser settings card through the standard Cordis and settings slots.

See [DEPLOYMENT.zh.md](./DEPLOYMENT.zh.md) for the complete build, installation, configuration, verification, upgrade, and troubleshooting guide.

For any native Harness source checkout, the one-command installer is
[`scripts/install-native-harness.sh`](./scripts/install-native-harness.sh). It builds
the locked package, installs it through the supported `dsh plugin` CLI, and never
stores Console or gateway credentials.

## Clone and install

The supported installation path is to clone this repository into a directory
you control and run the installer against an existing Harness source checkout.
The Harness `PROFILE` must already exist; the installer does not create or
select a running Web instance for you.

```sh
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

The command runs the package checks, creates a temporary tarball, and invokes
the Harness source checkout's native CLI. Restart the Harness Web process for
the selected profile after installation. Configure the Console endpoint and
route credentials in the plugin UI; no secret is read from this repository.

## User flow

1. Install the package into a Harness profile with `dsh plugin --profile <name> add <package-or-tarball>`.
2. Open Settings → Plugins → Higress AI routes.
3. Enter the Console management URL, username, and password. The URL may be a private HTTP(S) address and may include a reverse-proxy path prefix.
4. Select one route returned by `GET /v1/ai/callable-routes`.
5. For a `BEARER` route, enter the existing route credential once. An unauthenticated route uses the fixed local compatibility credential `higress-no-auth`.
6. The Host writes one provider profile into the official `llm-pi-ai` settings namespace. Requests then use the normal OpenAI-compatible data-plane path and Harness records native `usage` fields.

## Settings UI

- Uses Harness settings-page dimensions, spacing, radii, borders, and semantic state colors without introducing a separate theme or global style overrides.
- The sign-in area includes private URL guidance, autocomplete hints, password visibility control, and explicit loading feedback; passwords, cookies, and route credentials never enter the Remote snapshot.
- Route cards show protocol, models, authentication mode, availability, and selection state. The selected route exposes its final endpoint, model ID, and auth transport without displaying secrets.
- Auto-refresh accepts a 15–3600 second interval and shows the last synchronization time. Empty, degraded, and failed states include semantic messaging and recoverable actions.
- Native form semantics, associated labels, `aria-live`/`role="alert"`, and keyboard-operable buttons are used for accessibility and future Harness theme adaptation.

The gateway protocol enum `OPENAI_CHAT_COMPLETIONS` is translated to the official
`openai-completions` provider API. Provider IDs are derived from the gateway instance
and route ID, so two private gateways with the same route name do not overwrite each
other. If the gateway changes the bound credential ID, the local credential reference
changes as well and the UI asks for the existing key again.

## Build and install manually

```sh
PLUGIN_ROOT="/opt/harness-plugins"
HARNESS_SRC="/opt/harness"
PROFILE="<existing-profile>"

cd "$PLUGIN_ROOT/harness-gateway01"
npm ci
npm run typecheck
npm test
npm run build
npm pack
cd "$HARNESS_SRC"
pnpm dsh plugin --profile "$PROFILE" add \
  "file:$PLUGIN_ROOT/harness-gateway01/dsh-higress-ai-route-plugin-0.1.1.tgz"
```

The published artifact contains prebuilt JavaScript and the bundle patch, so an end user does not execute a TypeScript build during installation.

## Security boundaries

- The browser never receives the Console cookie, password, or API key.
- The Host stores the Console cookie and route key through `ctx.credentials`; settings and Remote state are secret-free.
- The plugin does not create or manage a gateway credential. A `BEARER` value is only a local Harness copy of the user's existing route credential.
- `HEADER` and `QUERY` routes remain visible but are marked unavailable until a later transport capability is deliberately added.
- Logout removes only the plugin-owned `llm-pi-ai` profile and cookie reference.
- The profile must include the official `@deepseek-ai/dsh-llm-pi-ai` provider; the plugin only writes its normal settings namespace and does not replace that adapter.

## Gateway contract

The gateway side exposes:

- `POST /session/login`
- `GET /v1/ai/callable-routes`
- `GET /v1/ai/callable-routes/{routeId}` with ETag/304 support
- OpenAI-compatible data-plane responses with native `usage`

No scoped usage endpoint or callback is required.
