// Cross-platform server bundle.
// Previously ran as an npm script: `esbuild server/index.ts --bundle
// --platform=node --format=cjs --outfile=server-dist/server.cjs --external:node:*`
// On Windows PowerShell the `--external:node:*` argument was mangled and
// esbuild failed with `bun: Invalid argument`, so the build is done here
// through esbuild's JS API instead of a shell command line.
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'server-dist/server.cjs',
  external: ['node:*'],
  logLevel: 'info',
})
