"""Authored p9 itemization content.

All ids, names and numbers here are original to p9.  The tier *shape* (five
tiers, geometric growth, top-tier rarity) is informed by research/poe, but no
PoE name, text or value is copied verbatim.
"""

# stat: (unit, mode, base, min, max, name_en, name_zh)
# percentages are fractions (0.05 == 5%) to match p9's gear formula `1 + pct`.
STATS = [
    ("healthBonus", "int", "add", 0, 0, 100000, "Vitality", "生命"),
    ("damagePct", "fraction", "add", 0, 0, 3.0, "Force", "伤害"),
    ("attackSpeedPct", "fraction", "add", 0, 0, 0.6, "Tempo", "攻速"),
    ("critPct", "fraction", "add", 0, 0, 0.75, "Precision", "暴击"),
    ("critMultiplierPct", "fraction", "add", 0, 0, 3.0, "Severity", "暴伤"),
    ("damageFlatMin", "int", "add", 0, 0, 100000, "Force Floor", "伤害下限"),
    ("damageFlatMax", "int", "add", 0, 0, 100000, "Force Ceiling", "伤害上限"),
    ("physicalDamagePct", "fraction", "add", 0, 0, 3.0, "Edge", "物理伤害"),
    ("spellDamagePct", "fraction", "add", 0, 0, 3.0, "Lore", "法术伤害"),
    ("armorFlat", "int", "add", 0, 0, 100000, "Plating", "护甲"),
    ("armorPct", "fraction", "add", 0, 0, 3.0, "Fortification", "护甲强化"),
    ("evasionFlat", "int", "add", 0, 0, 100000, "Suppleness", "闪避"),
    ("evasionPct", "fraction", "add", 0, 0, 3.0, "Elusion", "闪避强化"),
    ("energyShieldFlat", "int", "add", 0, 0, 100000, "Warding", "护盾"),
    ("energyShieldPct", "fraction", "add", 0, 0, 3.0, "Resonance", "护盾强化"),
    ("damageReductionPct", "fraction", "add", 0, 0, 0.6, "Tempering", "减伤"),
    ("blockChance", "fraction", "add", 0, 0, 0.5, "Guard", "格挡"),
    ("manaFlat", "int", "add", 0, 0, 100000, "Wellspring", "法力"),
    ("manaRegenPct", "fraction", "add", 0, 0, 2.0, "Flow", "法力回复"),
    ("lifeRegenFlat", "float", "add", 0, 0, 100000, "Renewal", "生命回复"),
    ("movementSpeedPct", "fraction", "add", 0, 0, 0.4, "Fleetness", "移速"),
    ("strength", "int", "add", 0, 0, 100000, "Might", "力量"),
    ("dexterity", "int", "add", 0, 0, 100000, "Grace", "敏捷"),
    ("intelligence", "int", "add", 0, 0, 100000, "Insight", "智力"),
    ("fireResistance", "fraction", "add", 0, 0, 0.75, "Emberward", "火焰抗性"),
    ("coldResistance", "fraction", "add", 0, 0, 0.75, "Frostward", "冰霜抗性"),
    ("lightningResistance", "fraction", "add", 0, 0, 0.75, "Stormward", "闪电抗性"),
    ("chaosResistance", "fraction", "add", 0, 0, 0.6, "Voidward", "混沌抗性"),
    ("itemRarityPct", "fraction", "add", 0, 0, 2.0, "Fortune", "物品稀有度"),
    ("goldFindPct", "fraction", "add", 0, 0, 2.0, "Avarice", "金币获取"),
]

# (stat, t1_min, t1_max, t5_max, family_weight, name_en, name_zh)
# t1/t5 are authored endpoints; tiers 2-4 are interpolated geometrically.
AFFIX_SPECS = {
    "health": ("healthBonus", 4, 8, 55, 900, "Hale", "强健"),
    "damage": ("damagePct", 0.02, 0.04, 0.30, 700, "Keen", "锋锐"),
    "attack_speed": ("attackSpeedPct", 0.01, 0.02, 0.14, 600, "Swift", "迅捷"),
    "crit": ("critPct", 0.01, 0.02, 0.12, 500, "Precise", "精准"),
    "crit_mult": ("critMultiplierPct", 0.04, 0.08, 0.45, 450, "Decisive", "决绝"),
    "edged": ({"damageFlatMin": (2, 4, 18), "damageFlatMax": (4, 7, 34)}, 800, "Honed", "磨砺"),
    "physical": ("physicalDamagePct", 0.02, 0.05, 0.34, 650, "Whetted", "锐利"),
    "spell": ("spellDamagePct", 0.02, 0.04, 0.30, 600, "Arcane", "奥术"),
    "armor": ("armorFlat", 8, 14, 130, 900, "Plated", "覆甲"),
    "armor_pct": ("armorPct", 0.03, 0.06, 0.40, 700, "Fortified", "坚垒"),
    "evasion": ("evasionFlat", 8, 14, 130, 900, "Supple", "柔韧"),
    "evasion_pct": ("evasionPct", 0.03, 0.06, 0.40, 700, "Elusive", "闪避"),
    "shield": ("energyShieldFlat", 4, 8, 60, 800, "Warded", "护盾"),
    "shield_pct": ("energyShieldPct", 0.03, 0.06, 0.40, 650, "Resonant", "共鸣"),
    "reduction": ("damageReductionPct", 0.01, 0.02, 0.14, 400, "Tempered", "淬炼"),
    "block": ("blockChance", 0.01, 0.03, 0.12, 400, "Guarding", "守护"),
    "mana": ("manaFlat", 4, 8, 60, 700, "Wellspring", "灵泉"),
    "mana_regen": ("manaRegenPct", 0.03, 0.06, 0.35, 550, "Flowing", "流涌"),
    "regen": ("lifeRegenFlat", 0.5, 1.0, 9.0, 500, "Renewing", "复生"),
    "move": ("movementSpeedPct", 0.02, 0.03, 0.20, 500, "Fleet", "疾行"),
    "str": ("strength", 2, 4, 30, 500, "Mighty", "力量"),
    "dex": ("dexterity", 2, 4, 30, 500, "Nimble", "灵巧"),
    "int": ("intelligence", 2, 4, 30, 500, "Astute", "睿智"),
    "fire_res": ("fireResistance", 0.03, 0.06, 0.38, 900, "Emberbound", "余烬之御"),
    "cold_res": ("coldResistance", 0.03, 0.06, 0.38, 900, "Frostbound", "霜寒之御"),
    "lightning_res": ("lightningResistance", 0.03, 0.06, 0.38, 900, "Stormbound", "雷霆之御"),
    "chaos_res": ("chaosResistance", 0.02, 0.04, 0.24, 500, "Voidbound", "虚空之御"),
    "rarity": ("itemRarityPct", 0.02, 0.05, 0.30, 300, "Fortunate", "幸运"),
    "gold": ("goldFindPct", 0.04, 0.08, 0.50, 350, "Avaricious", "贪婪"),
}

# 8 pools (ring1/ring2 share the ring pool). 7 prefix + 7 suffix each.
POOLS = {
    "weapon": {
        "prefix": ["edged", "damage", "physical", "crit", "attack_speed", "spell", "crit_mult"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "str", "dex", "rarity"],
    },
    "offhand": {
        "prefix": ["health", "armor", "armor_pct", "evasion", "shield", "block", "reduction"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "int", "rarity", "gold"],
    },
    "helmet": {
        "prefix": ["health", "armor", "armor_pct", "evasion", "shield", "regen", "damage"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "int", "rarity", "gold"],
    },
    "armor": {
        "prefix": ["health", "armor", "armor_pct", "evasion", "evasion_pct", "shield", "reduction"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "str", "rarity", "gold"],
    },
    "gloves": {
        "prefix": ["health", "edged", "damage", "crit", "attack_speed", "armor", "evasion"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "dex", "rarity", "gold"],
    },
    "boots": {
        "prefix": ["health", "armor", "armor_pct", "evasion", "shield", "evasion_pct", "regen"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "move", "dex", "rarity"],
    },
    "amulet": {
        "prefix": ["health", "damage", "spell", "crit", "crit_mult", "shield", "mana"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "str", "int", "rarity"],
    },
    "ring": {
        "prefix": ["health", "armor", "edged", "damage", "mana", "shield", "regen"],
        "suffix": ["fire_res", "cold_res", "lightning_res", "chaos_res", "dex", "rarity", "gold"],
    },
}

# 9 equip slots map onto 8 pools; ring1/ring2 share the ring pool.
SLOTS = [
    ("weapon", "weapon", "Weapon", "武器"),
    ("offhand", "offhand", "Offhand", "副手"),
    ("helmet", "helmet", "Helmet", "头盔"),
    ("armor", "armor", "Armor", "胸甲"),
    ("gloves", "gloves", "Gloves", "手套"),
    ("boots", "boots", "Boots", "靴子"),
    ("amulet", "amulet", "Amulet", "项链"),
    ("ring1", "ring", "Left Ring", "左戒"),
    ("ring2", "ring", "Right Ring", "右戒"),
]

# (id, pool, dropLevel, name_en, name_zh, bases)
BASE_TYPES = [
    ("iron_blade", "weapon", 1, "Iron Blade", "铁刃",
     {"damageFlatMin": 4, "damageFlatMax": 8}),
    ("runed_maul", "weapon", 38, "Runed Maul", "符文重锤",
     {"damageFlatMin": 14, "damageFlatMax": 24}),
    ("oak_buckler", "offhand", 1, "Oak Buckler", "橡木圆盾",
     {"armorFlat": 8, "blockChance": 0.05}),
    ("warded_tome", "offhand", 34, "Warded Tome", "护佑典籍",
     {"energyShieldFlat": 12, "manaFlat": 10}),
    ("padded_jack", "armor", 1, "Padded Jack", "衬垫皮甲",
     {"armorFlat": 14, "evasionFlat": 6}),
    ("chain_vest", "armor", 16, "Chain Vest", "链甲背心",
     {"armorFlat": 40, "evasionFlat": 12}),
    ("bastion_plate", "armor", 38, "Bastion Plate", "壁垒重铠",
     {"armorFlat": 95, "damageReductionPct": 0.03}),
    ("leather_cap", "helmet", 1, "Leather Cap", "皮革头盔",
     {"armorFlat": 8, "evasionFlat": 8}),
    ("rough_gloves", "gloves", 1, "Rough Gloves", "粗革手套",
     {"armorFlat": 6, "evasionFlat": 6}),
    ("worn_boots", "boots", 1, "Worn Boots", "旧皮靴",
     {"armorFlat": 5, "evasionFlat": 7, "movementSpeedPct": 0.02}),
    ("ember_locket", "amulet", 1, "Ember Locket", "余烬坠饰",
     {"fireResistance": 0.06, "manaFlat": 8}),
    ("bone_band", "ring", 1, "Bone Band", "骨环",
     {"healthBonus": 6, "critPct": 0.01}),
]

# rarity: id, name_en, name_zh, weight, prefix(min,max), suffix(min,max)
RARITIES = [
    ("common", "Common", "普通", 1000, 0, 0, 0, 0),
    ("magic", "Magic", "魔法", 190, 1, 1, 0, 1),
    ("rare", "Rare", "稀有", 24, 2, 3, 2, 3),
    ("legendary", "Legendary", "传说", 1.2, 3, 3, 3, 3),
]

# 5 item-level bands × 3 enemy tiers.
ILVL_BANDS = [(1, 9, 5), (10, 19, 14), (20, 29, 24), (30, 39, 34), (40, 60, 50)]

SOURCE_RARITY_WEIGHTS = {
    "normal": {"common": 1000, "magic": 160, "rare": 10, "legendary": 0.2},
    "elite": {"common": 650, "magic": 380, "rare": 70, "legendary": 2.5},
    "boss": {"common": 0, "magic": 420, "rare": 350, "legendary": 18},
}

SLOT_WEIGHTS = {
    "weapon": 16, "offhand": 12, "helmet": 12, "armor": 16,
    "gloves": 12, "boots": 12, "amulet": 8, "ring": 12,
}

# Assumed engagement used for the 10-minute onboarding projection (see md).
FIRST_TEN_MINUTES = {
    "assumedKills": {"normal": 60, "elite": 4, "boss": 1},
    "itemDropsPerKill": {"normal": 0.3, "elite": 0.6, "boss": 1.0},
}
