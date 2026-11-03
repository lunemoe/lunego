# p9 原始素材归档

`p9-dungeon-arpg-v2.2.1.tar.gz` 保存既有 CC0 素材包的完整 256 个文件，包括尚未接入的职业、敌人、场景、物品、音频，以及原始 manifest、许可和制作脚本。归档逐文件校验过，内容与迁移前一致。

当前游戏只使用 `templates/game/assets` 的 35 项资源；该目录的 manifest 是运行时唯一事实源。原始归档用于后续取材与溯源，不加载、不生成另一套运行时，也不随游戏发布。

在仓库根目录可查看清单或解包到临时目录：

```bash
tar -tzf art/p9/p9-dungeon-arpg-v2.2.1.tar.gz
mkdir -p /tmp/p9-source
tar -xzf art/p9/p9-dungeon-arpg-v2.2.1.tar.gz -C /tmp/p9-source
```

接入新素材时，将实际使用的文件与元数据纳入 `templates/game/assets`，保留来源与许可，然后运行 `lunego gen` 并验证真实加载和游玩。
