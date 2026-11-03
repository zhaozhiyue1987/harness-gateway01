import { build } from 'esbuild'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true })
await mkdir(new URL('../dist/', import.meta.url), { recursive: true })

const common = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  sourcemap: true,
  outdir: new URL('../dist/', import.meta.url).pathname,
  packages: 'external',
  logLevel: 'info',
}

// Harness loads browser plugins through its module-table factory rather than
// as native ESM files. Keep only React as a shared runtime import; every other
// value dependency is bundled into the plugin-owned factory closure.
const clientModuleLoader = {
  format: 'cjs',
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-higress-ai-route-plugin", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: {
    js: 'return module.exports; } });',
  },
}

await build({ ...common, entryPoints: ['src/host/index.ts', 'src/host/gateway-client.ts'], outbase: 'src', outdir: 'dist' })
await build({
  ...common,
  ...clientModuleLoader,
  platform: 'browser',
  packages: 'bundle',
  external: ['react', 'react/jsx-runtime'],
  entryPoints: ['src/client/index.tsx'],
  outbase: 'src',
  outdir: 'dist',
})
await build({ ...common, entryPoints: ['src/shared/contracts.ts', 'src/shared/route-mapper.ts'], outbase: 'src', outdir: 'dist' })
await execFileAsync('npx', ['tsc', '--project', 'tsconfig.types.json'])

for (const file of ['typert.host.js', 'typert.host.d.ts', 'typert.remote-client.js', 'typert.remote-client.d.ts']) {
  await copyFile(new URL(`../generated/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url))
}

async function rewriteDeclarationImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      await rewriteDeclarationImports(path)
      continue
    }
    if (!entry.name.endsWith('.d.ts')) continue
    const source = await readFile(path, 'utf8')
    const rewritten = source.replace(/(from\s+['"][^'"]+)\.(?:ts|tsx)(['"])/g, '$1.js$2')
    if (rewritten !== source) await writeFile(path, rewritten)
  }
}

await rewriteDeclarationImports(fileURLToPath(new URL('../dist/', import.meta.url)))
