# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Linux（x86_64）桌面构建 —— 本快照

本仓库是官方源码 `dsh-v0.1.7-rc.2` 标签的快照，并附带一个补丁，为 `pnpm run package:desktop:dir`
增加了 `linux-x64` 桌面构建目标。上游只发布 `mac-arm64`、`mac-x64` 与 `win-x64`，不支持 Linux 桌面构建。

该补丁还修复了 `sharp` 的图片解码崩溃——否则打包后的应用在 Linux 上无法正常使用；并让 Linux 窗口获得
Windows 上已有的无边框标题栏。

### 补丁改了什么

| 文件 | 改动 |
| --- | --- |
| `apps/desktop/scripts/desktop-build-paths.mjs` / `.d.mts` | 在 `SUPPORTED_TARGETS` 中接受 `linux-x64`，并把其准备载荷的平台上报为 `linux` |
| `apps/desktop/scripts/package-target.ts` | 新增 `linux-x64` 目标（`--linux --x64`） |
| `apps/desktop/scripts/desktop-upload-plan.ts` | 注册 `linux-x64` 上传描述符 |
| `apps/desktop/scripts/desktop-package-environment.mjs` / `.d.mts` | 读取 `.env.linux`、使用共享配置、校验 Linux 目标 |
| `apps/desktop/scripts/desktop-auto-update-environment.mjs` / `.d.mts` | 在 `UPDATE_TARGETS` 中接受 `linux-x64` |
| `apps/desktop/scripts/desktop-toolchain-preflight.ts` | 接受 Linux 目标 |
| `apps/desktop/scripts/prepare-runtime.ts` | Linux 上使用扁平布局的 `electron` 可执行文件 |
| `apps/desktop/scripts/prepare-dsh.ts` | Linux 的 `electron` 路径；打包时把 `sharp` 重新链接到系统 libvips |
| `apps/desktop/scripts/smoke-packaged-runtime.ts` | 定位 `linux-unpacked`；当目标选用 LibreOfficeKit 的 WASM 引擎时跳过 Office 部分 |
| `apps/desktop/scripts/smoke-prepared-runtime.ts` / `smoke-runtime.ts` | 把该跳过项传递到 Host 冒烟测试 |
| `apps/desktop/scripts/electron-builder-config.mjs` | Linux 图标、`executableName: 'deepseek-harness'`，且不注入强制更新策略 |
| `apps/desktop/.env.linux`（新增） | Linux 发布配置；对齐 `.env.windows.example`，不含签名凭据 |
| `apps/desktop/src/main.ts` | Linux 并入「隐藏标题栏 + 窗口控件覆盖层」路径，不再安装原生菜单栏，并把已安装的 `.desktop` 文件名声明为 shell 的应用 ID |
| `apps/desktop/src/preload-windows.ts` | Linux 上同样发布标题栏标记、应用/编辑菜单项与标题栏配色 |
| `apps/desktop/tests/*.spec.ts` | 覆盖 Linux 目标、标题栏、菜单、标题栏菜单与打包冒烟行为 |

0.1.6 版本的补丁需要两个文件，而 `dsh-v0.1.7-rc.2` 已让它们不再必要：上游用共享的
`scripts/primary-runtime/lock.json` 取代了 `primary-runtime-lock.json`（其中已锁定 `linux-x64`），
`prepare-primary-runtime.ts` 也改为把平台映射交给该共享构建器。

### Linux 上的 `sharp` 崩溃与修复

`sharp` 自带的 `@img/sharp-libvips-linux-x64` 是**静态链接 glib** 构建的 libvips，该库导出了自己的一套
`g_*` 符号。在 Linux 上，Electron 会把系统 `libglib-2.0.so.0` 载入全局符号作用域，于是 libvips 的内部调用
被解析到 Electron 的 glib，而不是它自己的那一份。这种错配会破坏堆内存：编码仍然正常，但**解码任意图片都会
让进程 SIGSEGV 崩溃**（上游问题：electron#46323，尚未修复）。

因此构建阶段会带上 `SHARP_FORCE_GLOBAL_LIBVIPS=1` 从源码把 `sharp` 重新编译到**系统 libvips** 上，让运行时
与 Electron 共用同一份 glib。重建出的 addon 会覆盖 `@img/sharp-linux-x64/lib/` 中的预编译产物——该目录被
asar 解包，因此 `.node` 文件仍可从 `app.asar` 内部 `dlopen`。该步骤位于生产 `node_modules` 拷贝之后、
运行时清单哈希计算之前，从而保证打包载荷的一致性。

### 依赖要求

- Node.js、pnpm（经 Corepack），以及带 `node-gyp`、`pkgconf` 的 C++ 工具链
- `libvips` ≥ 8.18（含开发文件）—— 8.18.6 正好满足 `sharp` 的要求
- `libheif` 为可选；未安装时 libvips 会打印警告，且无法解码 HEIC/AVIF

### 构建

```sh
pnpm install --frozen-lockfile
pnpm run package:desktop:dir
```

产物位于 `apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/`。

### 运行

```sh
apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/deepseek-harness
```

### 在 Arch Linux 上安装

`chrome-sandbox` 必须属于 `root:root` 且权限为 `4755`，否则 Electron 会拒绝启动。将构建产物安装到
`/opt` 并加入 `PATH`：

```sh
sudo install -d /opt/deepseek-harness
sudo cp -r apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/. /opt/deepseek-harness/
sudo chown -R root:root /opt/deepseek-harness
sudo chmod 4755 /opt/deepseek-harness/chrome-sandbox
sudo ln -sf /opt/deepseek-harness/deepseek-harness /usr/bin/deepseek-harness
```

### 验证修复

```sh
readelf -d apps/desktop/.desktop-build/targets/linux-x64/artifacts/linux-unpacked/resources/app.asar.unpacked/dsh/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-*.node | grep NEEDED
# libvips-cpp.so.42, libvips.so.42, libglib-2.0.so.0 — no statically linked glib
```

打包运行时冒烟测试会报告 `sharp: true`；在 Electron 内（`ELECTRON_RUN_AS_NODE=1`）执行一次编码/解码往返
的退出码为 0，而在修复前每次都会段错误。

### 已知限制

- 非官方改动，上游不予支持；锁定标签更新后补丁可能需要同步调整。
- `apps/desktop/.env.linux` 选择的是 `test` 自动更新源。
- 在 Electron 下 `sharp` 仍会打印 `[SharpElectronLinux]` 警告；改用系统 libvips 后它已是无害提示。
- Linux 构建不注入强制更新策略：该策略服务只提供 Windows 与 macOS 通道，而桌面端在存在策略时会拒绝
  在其它平台上启动。
- Linux 标题栏使用 Electron 的窗口控件覆盖层（Window Controls Overlay），窗口按钮由 Electron 依据页面
  上报的颜色绘制，不再跟随 GTK 主题。
- Linux 的程序坞图标通过 XDG 应用 ID 关联，而该 ID 由 Electron 从 `app.name` 推导——这里是 npm 包名，
  任何已安装的 `.desktop` 条目都不叫这个名字。因此 shell 在 `ready` 之前声明桌面名为
  `deepseek-harness`；缺少这一步时，程序坞会退回通用可执行文件图标。
- Office 文档无法转换为 PDF：`@deepseek-ai/libreoffice-kit` 未发布 Linux 引擎，而它在归档内部探测已安装
  包时，会把 Electron 对缺失 asar 条目返回的 `null` 当作「已安装但不完整」，因此永远无法回退到 WASM 引擎。
  打包冒烟测试因此在打包形态无法转换期间跳过 Office 部分，待上游发布 Linux 引擎后自动恢复。

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
