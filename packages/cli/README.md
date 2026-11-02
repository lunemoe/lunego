# lunego CLI

项目生成与资产管线命令。游戏通过 `assets/manifest.json` 声明资源，`lunego gen` 生成类型化 `Assets`/`AssetPack`。

## 命令

```bash
lunego assets check
lunego assets build
lunego assets import aseprite <file.json> [--png file.png] [--id id] [--write]
lunego assets import ldtk <file.ldtk> [--id-prefix prefix] [--write]
lunego assets pack --out assets/atlas.png --manifest assets/atlas.frames.json id=image.png...
```

- `check`：校验 manifest、真实 PNG 尺寸/帧范围、font/audio 文件与扩展名、动画帧引用和生成文件是否最新；失败 exit 1。
- `build`：校验通过后写 `features/_generated/assets.ts`。
- `gen`/`check`：原有项目生成与完整项目检查，资产校验同样生效。

## 资产类型

- 图片：`sprite`、`sheet`、`spritesheet`、`tileset`、`atlas`、`image`，必须是可解码 PNG。
- 字体：`font`，支持 `.woff`/`.woff2`/`.ttf`/`.otf`。
- 音频：`audio`，支持 `.wav`/`.mp3`/`.ogg`/`.m4a`/`.aac`/`.flac`/`.opus`。
- `json`、`ldtk` 作为普通源文件保留。
- 动画必须有可解析的帧数（显式 `frames` 或 grid 元数据）；Aseprite 导入的 `durations` 单位为毫秒，运行时可用 `@lunego/render-pixi` 的 `assetAnimationDurations` 转秒。

## AssetPack 指纹

生成的 `AssetPack` 可直接传给 `ContentRegistry.setAssetPack(AssetPack)`，其 pack/version/hash 会进入 content fingerprint，存档可检测资产版本变化。

## 外部 workspace 镜像

在不是 LuneGo 仓库的空目录运行 `lunego new game demo` 时，CLI 会生成：

```text
.lunego/packages/   # core/host/input/render-pixi/ui/vfx/audio/i18n/testkit/cli/eslint-plugin
.lunego/kits/       # 所有 kits/kit-*
pnpm-workspace.yaml # games/*、.lunego/packages/*、.lunego/kits/*
games/demo/
```

CLI 会从源码 checkout 的相邻 `packages/`/`kits/`，或安装布局的 `node_modules/@lunego` 发现并复制；kit 列表不硬编码，新增 `kits/kit-*` 会自动进入镜像。已有本仓库 `packages/`/`kits/` 或镜像目录时不会重复创建外部镜像。之后在该目录 `pnpm install --offline` 可解析模板的 `@lunego/*` 与 `@lunego/kit-*` workspace 依赖。
