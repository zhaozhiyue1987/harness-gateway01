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

### Understand the two directories first

The installation uses two different directories. Do not set them to the same path:

| Name | Meaning | Expected contents | Example |
| --- | --- | --- | --- |
| Plugin directory | The `harness-gateway01` directory cloned from this GitHub repository; run `npm` commands here | `package.json`, `scripts/`, `src/` | `/Users/your-name/harness-plugins/harness-gateway01` |
| Harness source directory | The root of your Harness source checkout; run `pnpm dsh` here | `package.json`, `apps/cli/src/bin.ts`, `apps/` | `/Users/your-name/harness` |

The directories should be siblings, not nested inside one another:

```text
/Users/your-name/
├── harness-plugins/
│   └── harness-gateway01/   # plugin directory: npm ci/build/pack
└── harness/                 # Harness source directory: pnpm dsh plugin ... add
```

`PROFILE` is a profile name such as `web`, not a directory path. It must already exist in Harness.

```sh
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

The following is a beginner-friendly, step-by-step procedure. You may open a
terminal in any starting directory, but do not skip the `cd` commands. The
plugin build commands and the Harness installation command run in different
directories.

### Step 1: Set the three paths

Run this from any directory. Replace the values with real paths. `PLUGIN_ROOT`
is the parent directory for plugin checkouts; `HARNESS_SRC` is the root of the
Harness source checkout; `PROFILE` is an existing Harness profile name.

```sh
PLUGIN_ROOT="$HOME/harness-plugins"
HARNESS_SRC="$HOME/harness"
PROFILE="web"
```

Do not leave `PROFILE` as `<existing-profile>`. If your profile is not named
`web`, replace `web` with its actual name.

### Step 2: Confirm the Harness source directory

This check can also be run from any directory. It must print the confirmation
line without an error:

```sh
test -f "$HARNESS_SRC/package.json" && \
test -f "$HARNESS_SRC/apps/cli/src/bin.ts" && \
echo "Harness source checkout: $HARNESS_SRC"
```

If it fails, stop and set `HARNESS_SRC` to the directory that contains both
`package.json` and `apps/cli/src/bin.ts`.

If `cd "$HARNESS_SRC"` reports `no such file or directory`, the variable still
points to an example or old path. A failed `cd` leaves the shell in the plugin
directory, so `pwd` will still end in `harness-gateway01`; do not run `pnpm dsh`
there. Locate the Harness CLI source first:

```sh
find "$HOME" -path "*/apps/cli/src/bin.ts" -print 2>/dev/null
```

If the result is `/Users/your-user/project/harness/apps/cli/src/bin.ts`, set the
parent directory and verify it:

```sh
export HARNESS_SRC="$HOME/project/harness"
cd "$HARNESS_SRC"
pwd
test -f package.json && test -f apps/cli/src/bin.ts && \
  echo "Harness source checkout: $HARNESS_SRC"
```

Run `pnpm dsh plugin ... add` only after `pwd` shows the Harness source root.

### Windows WSL2

The command order is the same as macOS, but run every command in the WSL Ubuntu
terminal, not PowerShell. Keep both checkouts in the WSL Linux filesystem (for
example under `$HOME`), not under `/mnt/c` or another Windows-mounted path.
From the WSL terminal, verify Node.js `>=22.19.0`, then enable Corepack when
needed:

```sh
uname -srm
node --version
npm --version
corepack enable
pnpm --version
```

Run `pnpm install --frozen-lockfile` once in the Harness source root before the
first `pnpm dsh` command. The plugin still uses `npm ci`, build, test and pack
in its own checkout. WSL may not run systemd; if the installer cannot restart
`dsh-harness`, restart Harness Web using its existing WSL launch command before
opening the Web UI from Windows.

### Step 3: Clone the plugin and enter the plugin directory

Run these commands from any directory:

```sh
mkdir -p "$PLUGIN_ROOT"
git clone https://github.com/zhaozhiyue1987/harness-gateway01.git \
  "$PLUGIN_ROOT/harness-gateway01"
cd "$PLUGIN_ROOT/harness-gateway01"
pwd
```

The final `pwd` must print a path ending in `harness-gateway01`. All `npm`
commands in the next step must be run in this directory.

### Step 4: Build and test in the plugin directory

Remain in `"$PLUGIN_ROOT/harness-gateway01"` and run each command in order:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm pack
```

Expected results are: typecheck and tests exit with code 0; build creates
`dist/`; and `npm pack` creates
`dsh-higress-ai-route-plugin-0.1.1.tgz` in the current plugin directory.

Confirm the package exists before continuing:

```sh
ls -lh dsh-higress-ai-route-plugin-0.1.1.tgz
```

### Step 5: Switch to the Harness source directory

This is the important directory change. The next command must not be run from
the plugin directory:

```sh
cd "$HARNESS_SRC"
pwd
```

The final `pwd` must print the Harness source checkout, not
`harness-gateway01`.

### Step 6: Install the tarball into the existing profile

Remain in `"$HARNESS_SRC"` and run:

```sh
pnpm dsh plugin --profile "$PROFILE" add \
  "file:$PLUGIN_ROOT/harness-gateway01/dsh-higress-ai-route-plugin-0.1.1.tgz"
```

This command installs the package into the selected profile. It does not create
a profile and it does not configure Console credentials.

### Step 7: Restart Harness Web and verify

Restart the Harness Web process using the method used by your deployment. Then
open Harness, go to **Settings → Plugins**, and confirm that **Higress AI
routes** is loaded. Configure the Console endpoint and route credentials only
after the bundle appears.

If you prefer the one-command installer, run it from the plugin directory after
Steps 1–3:

```sh
HARNESS_SRC="$HARNESS_SRC" PROFILE="$PROFILE" \
  ./scripts/install-native-harness.sh
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
