# PoE 数据参考（研究用，非游戏运行时内容）

把 Path of Exile 1 的装备/词缀/技能数据结构，归一化成 p9 可以自建的数据模型与参数。
**本目录只保存自命名的派生统计与少量数值聚合**，不保存原始导出、专有名称、描述文本或美术路径。

## 数据源与版本

| 项 | 值 |
| --- | --- |
| 数据集 | RePoE 格式的 GGPK 社区导出（`repoe-fork/repoe`，活跃维护的分支） |
| 仓库 | <https://github.com/repoe-fork/repoe>（commit `aa9fa7c3`，2026-10-25） |
| 托管导出 | <https://repoe-fork.github.io/> |
| 快照时间 | HTTP `Last-Modified: Mon, 19 Oct 2026 04:15:16 GMT`（各文件取自同一次导出） |
| 游戏 | Path of Exile 1（PC）；导出本身不写补丁号，故不宣称具体赛季 |
| 原始文件位置 | `/tmp/poe-data/repoe-latest/`（**不进入仓库**） |
| 下载量 | 约 99 MB（18 个 JSON） |

使用的输入：`mods.json`、`base_items.json`、`gems.json`、`stats.json`、
`default_monster_stats.json`；上下文参考 `stat_translations.json`、`item_classes.json`、
`characters.json`（未直接写入产物）。输入的 sha256 记录在每个产物的 `meta.inputs` 里，
可直接核对快照是否变化。

## 许可结论（重要）

- RePoE 的**代码**是 MIT；但其 `LICENSE.md` 明确写道：`data` 目录的内容归 Grinding Gear Games
  所有，只能在符合 GGG 使用条款的前提下使用或发布。
- 因此：**原始 JSON 只留在 `/tmp`，不进仓库、不随游戏分发**。仓库里只有聚合统计、
  自命名的字段、公式与区间数字（事实性数据），不含名称/文本/美术。
- 未使用 poedb 抓取（其 ToS 与反爬限制更严格，且内容同属 GGG）。
- 若之后要把具体数值也移出仓库，只需删除 `data/*.json`，保留 `tools/extract.py` 与文档；
  脚本可从 `/tmp` 重新生成全部产物。

## 目录

```
research/poe/
├── README.md                  # 本文件：来源、许可、字段、复现
├── DESIGN-NOTES.md            # 机制取舍与 p9 可调参数建议
├── schema.example.json        # 自命名的归一化数据示例（含 3 个词缀族、聚合算例）
├── p9-itemization.json        # p9 第一版物品/词缀/掉落数据（112 族 / 560 tier）
├── p9-itemization.md          # 该数据的设计说明、kit 映射与稀有度节奏
├── p9-classes.json            # p9 两职业/10 技能/72 被动节点/1-20 等级曲线
├── p9-classes.md              # 职业差异、技能表、被动树、kit 映射与 UI 建议
├── tools/
│   ├── extract.py             # 提取/归一化/校验脚本（仅标准库）
│   ├── p9_spec.py             # p9 自命名的 stat/词缀/基底/稀有度内容
│   ├── build_itemization.py   # 生成 p9-itemization.json + --check
│   ├── p9_classes_spec.py     # 职业/技能/被动/成长曲线内容
│   └── build_classes.py       # 生成 p9-classes.json + --check
└── data/                      # 生成物，合计约 507 KiB
    ├── base-types.json        # 物品类别、代表基底、等级/需求/防御成长拟合
    ├── affixes.json           # 203 个词缀族、916 个 tier、权重与数值区间
    ├── stats.json             # 115 个归一化 stat 键 + “基底→加法→乘法”聚合模型
    ├── skills.json            # 宝石分类/标签/等级曲线形状/辅助门控规则
    ├── drops.json             # 掉落等级分布、词缀池规模、tier 概率、怪物成长
    └── _summary.json          # 计数与输入校验和
```

## 复现

```bash
# 1) 下载（任意目录均可，建议 /tmp）
mkdir -p /tmp/poe-data/repoe-latest && cd /tmp/poe-data/repoe-latest
for f in mods base_items gems stats stat_translations default_monster_stats \
         characters item_classes tags; do
  curl -sS -O "https://repoe-fork.github.io/$f.json"
done

# 2) 生成聚合产物（确定性的：重复运行字节一致）
python3 research/poe/tools/extract.py \
  --data /tmp/poe-data/repoe-latest \
  --out  research/poe/data

# 3) 校验示例 schema
python3 research/poe/tools/extract.py --check research/poe/schema.example.json

# 4) 生成/校验 p9 物品数据（不依赖 /tmp，纯自命名内容）
python3 research/poe/tools/build_itemization.py
python3 research/poe/tools/build_itemization.py --check

# 5) 生成/校验 p9 职业数据（依赖 p9-itemization.json 的 stat 表）
python3 research/poe/tools/build_classes.py
python3 research/poe/tools/build_classes.py --check
```

脚本结束会打印统计（物品类别数、词缀族/tier 数、宝石数等），与
`data/_summary.json` 中的计数一致。

## 归一化规则（读产物前必看）

1. **槽位**：14 个代表槽位（ring/amulet/belt/helmet/body_armour/gloves/boots/shield/
   quiver/sword_1h/axe_2h/bow/staff/wand）。每个槽位选“最低掉落等级且在售”的基底作为
   标签样本，用于判定词缀能否出现。
2. **spawn weight**：按 RePoE 文档语义——`spawn_weights` 是**有序**列表，取第一个
   “基底拥有该 tag”的条目的权重；权重 0 表示不可出现。
3. **词缀族**：`kind(prefix/suffix) + 主归一化 stat + 精确可用槽位集合`。同一族在物品上互斥
   （对应 PoE 的 mod group 规则）。tier 1 = 族内最低等级需求；同等级多个变体记为
   `variants`，数值取并集。
4. **数值区间**：`stats[key] = {min,max}`；成对伤害（如最小/最大附加伤害）合并为一个键的
   `[min,max]`，因此表示的是“这一条词缀的掷值区间”，不是两个独立词缀。
5. **不做的事**：不导出 `name`、`text`、`description`、`display_name`、`dds_file`；
   词缀族不含原文，只保留 `stat` 归一化键。可用 `grep -c '"name"' data/*.json` 自检为 0。

## 产物字段

### `affixes.json`
```
families[]:
  id, kind, stat, slots[], tier_count, ilvl_range, value_growth{...}
  tiers[]: { tier, ilvl, stats{key:{min,max}}, slot_weight{slot:w}, variants }
coverage: { normal_affix_mods, families, mapped_stats, unmapped_stat_ids, ... }
rules: { family_key, weight_semantics, rare_item_budget{prefix_max,suffix_max}, ... }
```

### `stats.json`
```
aggregation_model.pipeline: base -> flat -> increased -> more -> final 的可执行顺序
aggregation_model.evidence: stats.json 中 local / aliased / scalable 的计数
catalog[]: { key, unit, stack_mode, affix_kinds, family_count, observed_range }
```

### `base-types.json`
```
classes[]: { class, base_count, drop_level, attribute_requirement, implicit_count }
representative_bases[]: { id, slot, drop_level, requirements, defence, weapon, ... }
scaling_fits[]: y = a * ilvl^b（防御/需求）与 physical_dps 拟合，含 r²
```

### `skills.json`
```
counts, active_types[], gem_tags[], level_curve_medians, damage_growth_ratio_lvl1_to_20,
mana_growth_ratio_lvl1_to_20, cast_time_ms, weapon_restriction_buckets, archetypes[],
support_rules{ allowed_type_combinations, cost_multiplier, ... }
```
`archetypes` 是 13 个结构样本（近战直击/近战范围/投射物法术/投射物攻击/光环/诅咒/召唤/
位移/持续伤害/引导/图腾/陷阱/守护/战吼），只含类型标签与数值曲线，不含技能名与文案。

### `drops.json`
```
base_drop_level_buckets, implicit_count_distribution, currency{...},
affix_spawn_weight_histogram, affix_family_tier_count_distribution,
affix_pool_by_ilvl[], top_tier_probability_ring_ilvl83[], monster_stat_scaling{...}
```
`affix_pool_by_ilvl` 是“某槽位在给定 ilvl 下可出现的单词缀数量与权重总和”；
`monster_stat_scaling.growth_fit` 是 `y = a * level^b` 的最小二乘拟合。

## 统计（本次快照）

| 指标 | 值 |
| --- | --- |
| 已发布装备基底 | 1072（其中 573 个带 1 条固定词缀） |
| 物品类别（≥5 个基底） | 25 |
| 普通前缀/后缀词缀条目 | 940 |
| 归一化词缀族 | 203（前缀 100 / 后缀 103） |
| tier 总数 | 916（每族中位数 4；单 tier 族 48 个） |
| 归一化 stat 键 | 115（原始 stat id 23346 个） |
| 技能/辅助宝石 | 1458（主动 1010 / 辅助 448；主动技能类型 117 种） |
| 词缀池规模（ring，ilvl 1→83） | 前缀 4→78，后缀 12→123 |
| 顶级 tier 出现概率（ring@83，32 个族） | 中位数 16.7%，范围 9.1%–33.3% |

## 已知局限

- 导出是**快照**：补丁会改变具体数值与词缀表，但字段结构与聚合规则稳定。
- 只做普通前缀/后缀（`domain=item`，排除 essence-only、unique、enchant、implicit 等）；
  固定词缀（implicit）只统计数量，不展开数值。
- RePoE 不含掉落稀有度权重、物品掉落权重与交易数据；`drops.json` 因此不含这类数字，
  p9 的默认值在 `DESIGN-NOTES.md` 里以“自定”标注。
- 宝石集合包含 Vaal/alt/未发布变体（未按 `release_state` 过滤），因此计数大于游戏内
  可获取的技能数。
- `damage_multiplier` 只覆盖部分主动技能；曲线样本同时给出 `primary_stat`（按
  `tooltip_order` 定位的第一条基础伤害类 stat）作为补充，缺失记为 `null`。
