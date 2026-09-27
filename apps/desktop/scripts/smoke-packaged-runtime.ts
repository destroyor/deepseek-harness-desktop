/** Validate the assembled application, including native Office conversion outside ASAR. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'
import { selectOfficeEngine } from '../../../scripts/libreoffice-packages.mjs'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const linux = target.startsWith('linux-')
if (values.unsigned && !windows) throw new Error('desktop smoke: unsigned artifacts require Windows')
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts
// Linux keeps the executable and resources in a flat unpacked directory, where macOS nests both
// inside the bundle and Windows keeps them beside the executable.
const application = windows ? join(artifacts, 'win-unpacked')
  : linux ? join(artifacts, 'linux-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app', 'Contents')
const resources = join(application, windows || linux ? 'resources' : 'Resources')
const executable = windows ? join(application, 'DeepSeek Harness.exe')
  : linux ? join(application, 'deepseek-harness')
  : join(application, 'MacOS', 'DeepSeek Harness')
const packagedTarget = resolveDesktopPackageTarget(target)
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version, packagedTarget)
if (windows && !values.unsigned) await verifyWindowsCode(application)
// A target whose LibreOfficeKit engine is WASM cannot convert inside an archive, because the kit's
// installed-package probe treats Electron's `null` answer for a missing asar entry as a present but
// incomplete native engine. Its staging-tree smoke already covers that conversion.
const kitManifest = JSON.parse(readFileSync(
  join(paths.dsh, 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'package.json'), 'utf8')) as { optionalDependencies?: Record<string, string> }
const skipOffice = selectOfficeEngine(kitManifest, packagedTarget) === 'wasm'
await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor, { skipOffice })
