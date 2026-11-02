# @lunego/audio

Web Audio 总线和 Cue 播放。音频文件、音高/音量数值和 Cue 映射由游戏注入；逻辑层不 import 本包。

## API

- `AudioSystem`：`master/sfx/music/ui` 总线、并发上限、seeded jitter、`play`/`sync`/`destroy`。
- `SoundBank`：id → decoded `AudioBufferLike`；`load`/`register`/`loadManifest`，逐条失败隔离。
- `MusicController`：单循环 music voice、音量/静音/stop。
- `WebSoundLoader` / `createWebAudio`：浏览器 `fetch`/`decodeAudioData` 适配器。
- `registerAssetSounds` / `soundManifestFromAssets`：从生成的 `Assets` 批量注册 `type === 'audio'`。

## 资产接线

```ts
import { Assets } from '../features/_generated/assets.js'
import { createWebAudio, registerAssetSounds } from '@lunego/audio'

const { sounds, audio } = createWebAudio()
const report = await registerAssetSounds(
  sounds,
  Assets,
  (file, id) => `/assets/${id}/${file}`,
)
// report.failed 保留单个文件解码失败；缺失 file / 重复 id / bank 已存在 id 会直接抛错
```

`sourceFor` 返回 URL 字符串或 `ArrayBuffer`：浏览器 `WebSoundLoader` 接受 URL，测试或内嵌 WAV 可直接传 buffer。`soundManifestFromAssets` 可单独用于自定义加载器。

## 不变量

- 不读 `Math.random`/时钟；jitter 由注入 seed 派生。
- 未知 Cue、缺失 sound、重复 id、并发/音量非法值明确失败或返回失败报告。
- 不 import `features/*`、`games/*`、`content/*`。
