# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Linux (x86_64) desktop build — this snapshot

This repository is a snapshot of the official source at upstream master `ce7073d512` (which already
contains both the `dsh-v0.2.1-rc.5` and `dsh-v0.2.2-alpha.2` lines) plus a patch that adds
a `linux-x64` desktop build target to `pnpm run package:desktop:dir`. Upstream only ships `mac-arm64`,
`mac-x64` and `win-x64`, and does not support the Linux desktop build.

It also fixes the `sharp` image-decoding crash that otherwise makes the packaged app unusable on Linux,
repairs the Office engine probe inside the packaged archive so document conversion works on Linux, and
gives the Linux window the same frameless caption Windows already has.

### What the patch changes

| File | Change |
| --- | --- |
| `apps/desktop/scripts/desktop-build-paths.mjs` / `.d.mts` | Accept `linux-x64` in `SUPPORTED_TARGETS`, and report `linux` as the platform of the payload it prepares |
| `apps/desktop/scripts/package-target.ts` | Add the `linux-x64` target (`--linux --x64`) |
| `apps/desktop/scripts/desktop-upload-plan.ts` | Register the `linux-x64` upload descriptor |
| `apps/desktop/scripts/retain-desktop-ci.ts` | Stop the Windows/macOS-only retention step for a Linux target |
| `apps/desktop/scripts/desktop-package-environment.mjs` / `.d.mts` | Load `.env.linux`, accept only shared settings for a Linux target |
| `apps/desktop/scripts/desktop-auto-update-environment.mjs` / `.d.mts` | Accept `linux-x64` in `UPDATE_TARGETS` |
| `apps/desktop/scripts/desktop-toolchain-preflight.ts` | Accept a Linux target |
| `apps/desktop/scripts/prepare-runtime.ts` | Use the flat `electron` binary on Linux |
| `apps/desktop/scripts/prepare-cli.ts` | Mark the POSIX `dsh` launcher executable for every non-Windows target |
| `apps/desktop/scripts/prepare-dsh.ts` | Linux `electron` path; swap in the Electron-safe `sharp` rebuild while packaging |
| `apps/desktop/scripts/runtime-patch-policy.ts` + `apps/desktop/patches/@deepseek-ai__libreoffice-kit@0.1.5.patch` | Runtime-only patch so the Office engine probe reaches the bundled WASM engine inside `app.asar` |
| `apps/desktop/scripts/smoke-packaged-runtime.ts` | Locate `linux-unpacked` through the shared artifact-output resolver |
| `apps/desktop/scripts/electron-builder-config.mjs` | Linux icon, `executableName: 'deepseek-harness'`, a 24 px tray bitmap in the packaged resources, and no mandatory-update policy |
| `apps/desktop/cli/dsh` | Fall back to the executable beside the resources directory when the macOS `Contents/MacOS` path is absent |
| `apps/desktop/.env.linux` (new) | Linux release settings; mirrors `.env.windows.example`, no signing credentials |
| `apps/desktop/src/main.ts` | Linux joins the hidden-titlebar and window-controls-overlay path, installs no native menu bar, declares the installed `.desktop` filename as the shell's application ID, and creates the system tray that upstream gates to Windows |
| `apps/desktop/src/preload-windows.ts` | Publish the caption marker, Application/Edit entries and titlebar colors on Linux as well |
| `apps/desktop/tests/*.spec.ts` | Cover the Linux target, titlebar, menu, caption, patch plan and packaged-smoke behavior |

### The `sharp` crash on Linux, and the fix

`sharp` ships `@img/sharp-libvips-linux-x64`, a libvips built against a **statically linked glib**, and
that library exports its own `g_*` symbols. On Linux, Electron loads the system `libglib-2.0.so.0` into
the global symbol scope, so libvips' internal calls resolve to Electron's glib instead of libvips' own.
The mismatch corrupts the heap: encoding still works, but **decoding any image kills the process with
SIGSEGV** (upstream: electron#46323, unfixed).

The packaging sequence therefore replaces the runtime's `sharp` with a pinned, content-addressed
download of `@janhapke/sharp-electron@0.35.4-electron.1`, whose `linux-x64` build renames the colliding
glib symbols at link time, and removes the `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64`
binaries the rebuild supersedes. No system libvips or native toolchain is required. This runs after the
production `node_modules` copy and before the runtime inventory is hashed, keeping the packaged payload
consistent.

### Office documents on Linux

`@deepseek-ai/libreoffice-kit` publishes no Linux native engine, and inside an archive its probe read
Electron's `null` answer for a missing asar entry as a present but incomplete engine, so the bundled
WASM engine stayed out of reach. The runtime-only patch distinguishes the two answers, so packaged
Linux builds convert Office documents through the WASM engine.

### Requirements

- Node.js, pnpm (through Corepack), `tar` for extracting the pinned `sharp` rebuild archive, and ImageMagick for the tray bitmap

### Build

```sh
pnpm install --frozen-lockfile
magick apps/desktop/resources/icon.png -resize 24x24 apps/desktop/resources/tray-linux.png
pnpm run package:desktop:dir
```

`package:desktop:dir` selects `linux-x64` automatically when run on a Linux host. Artifacts are written
to `apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/`.

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

The packaged runtime smoke test reports `sharp: true`, and an encode/decode round trip executed inside
Electron (`ELECTRON_RUN_AS_NODE=1`) exits 0, where it previously segfaulted on every run.

### Known limitations

- Unofficial and unsupported by upstream; the patch will need updating when the pinned tag moves.
- `apps/desktop/.env.linux` selects the `test` auto-update origins.
- Linux builds carry no mandatory-update policy: the policy service serves Windows and macOS only, and the
  desktop shell refuses to start on other platforms while a policy is present.
- The Linux caption uses Electron's Window Controls Overlay, so the window buttons are drawn by Electron
  from the colors the page reports rather than by the GTK theme.
- Linux shell integration resolves the window icon through the XDG application ID, which Electron derives
  from `app.name` — here the npm package name, which no installed `.desktop` entry carries. The shell
  therefore declares `deepseek-harness` as its desktop name before `ready`; without it the dock falls
  back to a generic executable glyph.
- Office conversion runs on the LibreOfficeKit WASM engine; a Linux native engine is not published.

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
- Join <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord community</a>.

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
