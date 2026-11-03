# LICENSE

本素材包（`assets/sprites`, `assets/tiles`, `assets/ui`, `assets/audio`, `manifest.json`, `preview.png`）
整体以 **CC0 1.0 Universal** 发布：<https://creativecommons.org/publicdomain/zero/1.0/>。

可以商用、修改、再发布，无需署名。v2.1 合入的 `incoming2/`（crypt/ember/town 瓦片与 UI）和
`incoming3/`（AI 内容包 #3），v2.2 合入的 `incoming4/`（高分辨率角色/敌人/Boss，64–160px），
以及 v2.2.1 合入的 `incoming5/`（Boss / 大型怪 impact 行动作修正）
同为 CC0-1.0；源目录在校验通过后已删除，逐项来源保留在 `manifest.json`。

## 逐项许可

| 类别 | 许可 | 说明 |
| --- | --- | --- |
| AI 生成的角色/敌人/道具/图标（v2 + 内容包 #3） | CC0-1.0 | 由 `gpt-image-2.5` 依据本项目提示词生成，未含第三方图像输入 |
| 程序化瓦片/UI 九宫格 | CC0-1.0 | 本项目脚本确定性绘制 |
| crypt / ember / town 瓦片、tileset atlas、minimap/portrait 九宫格 | CC0-1.0 | 本项目 `incoming2/_gen` 脚本确定性绘制，无 AI、无第三方图像 |
| AI 内容包 #3：技能/装备图标、NPC、敌人、Boss2、道具、UI 图标 | CC0-1.0 | 本项目提示词生成；NPC 参考图来自本仓库自有素材 |
| AI 内容包 #4：高分辨率玩家/NPC/敌人/Boss（v2.2，64–160px） | CC0-1.0 | 本项目提示词生成，未含第三方图像输入；替换原角色 spritesheet 并新增 `enemy_ogre` |
| AI 内容包 #5：Boss / 大型怪 impact 行动作修正（v2.2.1） | CC0-1.0 | 本项目提示词生成，未含第三方图像输入；只替换 5 张 sheet 的 8 个动作行，其余行逐像素不变 |
| 音效 | CC0-1.0 | Juhani Junkala / SubspaceAudio，OpenGameArt |
| UI 九宫格 / 图标 | CC0-1.0 | 本项目脚本确定性绘制 / AI 生成 |
| 音乐 | CC0-1.0 | 本项目 `_gen/v2/music_gen.py` 程序化生成 |

## 注意

- 音效的 CC0 声明来自 OpenGameArt 素材页；若未来替换素材包，请重新核对许可。
- `assets/_gen/` 下的原始生成图（`raw/`）与提示词脚本仅供复现，不属于运行时资源。
- Manifest 中的 `palette` 为 28 色统一调色板，便于后续美术保持一致；新增素材建议复用。
- 稀疏 tileset atlas 末尾的未用单元格保持透明，不属于任何资产；对应 `columnOrder` 只列出有效单元格。
