# adventure

p9 的内容与装配 feature。移动、能力、伤害、拾取、背包、交易和遭遇机制来自 `@lunego/kit-runtime`；层数、成长数值、掉落策略与像素表现属于此游戏。

## 公共接口

- 表现按 runtime 的 `ContentTag` 读取生成的资源元数据；逻辑不再保存尺寸、颜色或贴图等表现字段。
- Model：`CharacterProfile`（profile：名字、等级、经验、击杀）；`RunProgress`（world：层数、结束 tick）。
- 命令：`p9.start`、`p9.advance`（只在清层且存活时接受）、`p9.revive`（只在死亡时接受）。
- 查询：`HudQuery`，返回存活最近目标、掉落、生命/经验/金币、装备伤害、冷却、层数/波次和胜负状态。
- `gearPower`：把基础装备与 power 词缀聚合为实际攻击加成，HUD 与伤害 hook 共用。

## 不变量

- 所有操作通过命令进入逻辑。表现层只读 Frame/DTO，不写组件。
- 新生实体在 flush 后可查询；任务接受安排在出生后的 tick，难度缩放消费上一 tick 的出生事件一次。
- 每层三波；更高层保留成长并缩放敌人生命与伤害。清层与复活清理旧敌人和未拾取掉落，重新启动遭遇；复活扣除 20% 金币且不清空装备、背包和经验。
- 敌人半血切换狂暴 AI profile；击杀奖励和升级由 Died 驱动，玩家死亡不会生成装备。
- 随机品质和词缀只用 world 的 loot RNG；内容表、能力与规则参与内容哈希。存读档后按相同命令推进结果一致。
- `feature.writes` 显式声明角色成长、难度缩放及实体清理需要的 runtime 写权限；hook 的游戏状态读取通过 `hookReads` 声明。

## 依赖

`@lunego/core`、`@lunego/kit-runtime`、`@lunego/kit-loot`；测试通过 host 驱动正常命令。

素材来自 `assets/manifest.json`；`registerP9Content` 将生成的 AssetPack 纳入内容指纹。表现直接按 ContentTag 绑定真实资源，动画、尺寸和锚点由元数据提供。
