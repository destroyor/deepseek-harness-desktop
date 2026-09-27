# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Linux (x86_64) desktop build — this snapshot

This repository is a snapshot of the official source at tag `dsh-v0.1.7-rc.2` plus a patch that adds
a `linux-x64` desktop build target to `pnpm run package:desktop:dir`. Upstream only ships `mac-arm64`,
`mac-x64` and `win-x64`, and does not support the Linux desktop build.

It also fixes the `sharp` image-decoding crash that otherwise makes the packaged app unusable on Linux, and
gives the Linux window the same frameless caption Windows already had.

### What the patch changes

| File | Change |
| --- | --- |
| `apps/desktop/scripts/desktop-build-paths.mjs` / `.d.mts` | Accept `linux-x64` in `SUPPORTED_TARGETS`, and report `linux` as the platform of the payload it prepares |
| `apps/desktop/scripts/package-target.ts` | Add the `linux-x64` target (`--linux --x64`) |
| `apps/desktop/scripts/desktop-upload-plan.ts` | Register the `linux-x64` upload descriptor |
| `apps/desktop/scripts/desktop-package-environment.mjs` / `.d.mts` | Load `.env.linux`, use the shared settings, validate a Linux target |
| `apps/desktop/scripts/desktop-auto-update-environment.mjs` / `.d.mts` | Accept `linux-x64` in `UPDATE_TARGETS` |
| `apps/desktop/scripts/desktop-toolchain-preflight.ts` | Accept a Linux target |
| `apps/desktop/scripts/prepare-runtime.ts` | Use the flat `electron` binary on Linux |
| `apps/desktop/scripts/prepare-dsh.ts` | Linux `electron` path; rebuild `sharp` against the system libvips while packaging |
| `apps/desktop/scripts/smoke-packaged-runtime.ts` | Locate `linux-unpacked`, and skip the Office legs while the target selects the LibreOfficeKit WASM engine |
| `apps/desktop/scripts/smoke-prepared-runtime.ts` / `smoke-runtime.ts` | Carry that skip into the Host smoke |
| `apps/desktop/scripts/electron-builder-config.mjs` | Linux icon, `executableName: 'deepseek-harness'`, and no mandatory-update policy |
| `apps/desktop/.env.linux` (new) | Linux release settings; mirrors `.env.windows.example`, no signing credentials |
| `apps/desktop/src/main.ts` | Linux joins the hidden-titlebar and window-controls-overlay path, installs no native menu bar, and declares the installed `.desktop` filename as the shell's application ID |
| `apps/desktop/src/preload-windows.ts` | Publish the caption marker, Application/Edit entries and titlebar colors on Linux as well |
| `apps/desktop/tests/*.spec.ts` | Cover the Linux target, titlebar, menu, caption and packaged-smoke behavior |

The 0.1.6 patch needed two files that `dsh-v0.1.7-rc.2` made unnecessary: it replaced
`primary-runtime-lock.json` with the shared `scripts/primary-runtime/lock.json`, which already locks
`linux-x64`, and `prepare-primary-runtime.ts` now delegates its platform mapping to that shared builder.

### The `sharp` crash on Linux, and the fix

`sharp` ships `@img/sharp-libvips-linux-x64`, a libvips built against a **statically linked glib**, and
that library exports its own `g_*` symbols. On Linux, Electron loads the system `libglib-2.0.so.0` into
the global symbol scope, so libvips' internal calls resolve to Electron's glib instead of libvips' own.
The mismatch corrupts the heap: encoding still works, but **decoding any image kills the process with
SIGSEGV** (upstream: electron#46323, unfixed).

The build therefore recompiles `sharp` from source against the **system libvips** with
`SHARP_FORCE_GLOBAL_LIBVIPS=1`, so the runtime and Electron share a single glib. The rebuilt addon
replaces the prebuilt one inside `@img/sharp-linux-x64/lib/` — that directory is asar-unpacked, so the
`.node` file can still be `dlopen`ed from within `app.asar`. This runs after the production
`node_modules` copy and before the runtime inventory is hashed, keeping the packaged payload consistent.

### Requirements

- Node.js, pnpm (through Corepack), and a C++ toolchain with `node-gyp` and `pkgconf`
- `libvips` ≥ 8.18 including its development files — 8.18.6 matches what `sharp` asks for
- `libheif` is optional; without it libvips logs warnings and cannot decode HEIC/AVIF

### Build

```sh
pnpm install --frozen-lockfile
pnpm run package:desktop:dir
```

Artifacts are written to `apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/`.

### Run

```sh
apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/deepseek-harness
```

### Install on Arch Linux

`chrome-sandbox` must be owned by `root:root` with mode `4755`, or Electron refuses to start. To
install the build under `/opt` and expose it on `PATH`:

```sh
sudo install -d /opt/deepseek-harness
sudo cp -r apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/. /opt/deepseek-harness/
sudo chown -R root:root /opt/deepseek-harness
sudo chmod 4755 /opt/deepseek-harness/chrome-sandbox
sudo ln -sf /opt/deepseek-harness/deepseek-harness /usr/bin/deepseek-harness
```

### Verify the fix

```sh
readelf -d apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/resources/app.asar.unpacked/dsh/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-*.node | grep NEEDED
# libvips-cpp.so.42, libvips.so.42, libglib-2.0.so.0 — no statically linked glib
```

The packaged runtime smoke test reports `sharp: true`, and an encode/decode round trip executed inside
Electron (`ELECTRON_RUN_AS_NODE=1`) exits 0, where it previously segfaulted on every run.

### Known limitations

- Unofficial and unsupported by upstream; the patch will need updating when the pinned tag moves.
- `apps/desktop/.env.linux` selects the `test` auto-update origins.
- `sharp` still prints its `[SharpElectronLinux]` warning under Electron; with the system libvips it is benign.
- Linux builds carry no mandatory-update policy: the policy service serves Windows and macOS only, and the
  desktop shell refuses to start on other platforms while a policy is present.
- The Linux caption uses Electron's Window Controls Overlay, so the window buttons are drawn by Electron
  from the colors the page reports rather than by the GTK theme.
- Linux shell integration resolves the window icon through the XDG application ID, which Electron derives
  from `app.name` — here the npm package name, which no installed `.desktop` entry carries. The shell
  therefore declares `deepseek-harness` as its desktop name before `ready`; without it the dock falls back
  to a generic executable glyph.
- Office documents cannot be converted to PDF: `@deepseek-ai/libreoffice-kit` publishes no Linux engine, and
  inside an archive its installed-package probe reads Electron's `null` answer for a missing asar entry as a
  present but incomplete engine, so the WASM fallback stays out of reach. The portable packaging smoke
  therefore skips its Office legs while the packaged snapshot cannot convert, and exercises them again once
  a Linux engine exists.

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
