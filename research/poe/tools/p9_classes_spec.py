"""Authored p9 class/skill/passive content (original names and numbers)."""

# Resource definitions per class. p9 currently tracks only mana; rage is the
# designed secondary resource for knight (mapped to mana until implemented).
RESOURCES = {
    "mana": {
        "id": "mana",
        "nameEn": "Mana",
        "nameZh": "法力",
        "max": 100,
        "regenPerSecond": 2.0,
        "spendTiming": "onCast",
    },
    "rage": {
        "id": "rage",
        "nameEn": "Rage",
        "nameZh": "怒气",
        "max": 100,
        "gainPerHit": 6,
        "decayPerSecond": 4,
        "spendTiming": "onCast",
    },
}

CLASSES = [
    {
        "id": "knight",
        "nameEn": "Knight",
        "nameZh": "骑士",
        "archetype": "melee / shield",
        "sprite": "player_knight",
        "base": {
            "health": 120,
            "mana": 70,
            "armorFlat": 12,
            "movementSpeed": 224,
            "critPct": 0.05,
            "critMultiplier": 2.0,
        },
        "resources": ["mana", "rage"],
        "primaryResource": "mana",
        "secondaryResource": "rage",
    },
    {
        "id": "mage",
        "nameEn": "Mage",
        "nameZh": "法师",
        "archetype": "ranged / elemental",
        "sprite": "player_mage",
        "base": {
            "health": 90,
            "mana": 120,
            "energyShieldFlat": 15,
            "movementSpeed": 224,
            "critPct": 0.06,
            "critMultiplier": 2.0,
        },
        "resources": ["mana"],
        "primaryResource": "mana",
        "secondaryResource": None,
    },
]

# (id, name_en, name_zh, cost_resource, cost, cooldown, target, tags, mechanic)
SKILLS = {
    "knight": [
        ("cleave", "Cleave", "劈砍", "mana", 10, 64,
         {"kind": "direction", "range": 116, "minDot": 0.1},
         ["melee", "physical", "attack", "cone"], "cone melee, scales with attack speed"),
        ("hurl_axe", "Hurl Axe", "掷斧", "mana", 8, 45,
         {"kind": "nearest", "range": 340},
         ["ranged", "physical", "attack", "projectile"], "single-target ranged attack"),
        ("lunge", "Lunge", "突进", "mana", 12, 130,
         {"kind": "direction", "range": 220},
         ["movement", "physical", "attack"], "short dash, hits enemies on the path"),
        ("shield_bash", "Shield Bash", "盾击", "mana", 14, 96,
         {"kind": "point", "range": 110},
         ["melee", "physical", "attack", "stun"], "stuns the target in front"),
        ("bulwark", "Bulwark", "壁垒", "rage", 30, 300,
         {"kind": "none"},
         ["guard", "rage"], "temporary damage reduction"),
    ],
    "mage": [
        ("ember_fan", "Ember Fan", "余烬扇", "mana", 9, 56,
         {"kind": "direction", "range": 130, "minDot": 0.2},
         ["spell", "fire", "aoe", "cone", "burn"], "cone fire spell, applies burn"),
        ("ember_bolt", "Ember Bolt", "余烬弹", "mana", 8, 45,
         {"kind": "nearest", "range": 420},
         ["spell", "fire", "projectile"], "single-target fire projectile"),
        ("blink", "Blink", "闪烁", "mana", 12, 120,
         {"kind": "direction", "range": 220},
         ["spell", "movement", "blink"], "teleport dash"),
        ("frost_nova", "Frost Nova", "霜爆", "mana", 14, 100,
         {"kind": "point", "range": 160},
         ["spell", "cold", "aoe", "chill"], "area burst that chills"),
        ("arc_surge", "Arc Surge", "电弧涌动", "mana", 16, 110,
         {"kind": "nearest", "range": 300},
         ["spell", "lightning", "chain", "shock"], "chain lightning"),
    ],
}

# (level, damage, extra) - damage is the primary hit; extras are mechanic-specific.
SKILL_LEVELS = {
    "knight.cleave": [
        (1, 26, {}), (2, 34, {}), (3, 42, {}), (4, 50, {}), (5, 58, {}),
        (6, 66, {}), (7, 74, {}), (8, 82, {}), (9, 90, {}), (10, 98, {}),
    ],
    "knight.hurl_axe": [
        (1, 22, {}), (2, 28, {}), (3, 34, {}), (4, 41, {}), (5, 48, {}),
        (6, 55, {}), (7, 62, {}), (8, 69, {}), (9, 77, {}), (10, 84, {}),
    ],
    "knight.lunge": [
        (1, 14, {}), (2, 17, {}), (3, 20, {}), (4, 24, {}), (5, 28, {}),
        (6, 32, {}), (7, 36, {}), (8, 40, {}), (9, 44, {}), (10, 48, {}),
    ],
    "knight.shield_bash": [
        (1, 30, {"stunChance": 0.35}), (2, 39, {"stunChance": 0.38}),
        (3, 48, {"stunChance": 0.41}), (4, 58, {"stunChance": 0.44}),
        (5, 68, {"stunChance": 0.47}), (6, 78, {"stunChance": 0.50}),
        (7, 88, {"stunChance": 0.52}), (8, 98, {"stunChance": 0.54}),
        (9, 109, {"stunChance": 0.57}), (10, 120, {"stunChance": 0.60}),
    ],
    "knight.bulwark": [
        (1, 0, {"guardPct": 0.18}), (2, 0, {"guardPct": 0.20}),
        (3, 0, {"guardPct": 0.23}), (4, 0, {"guardPct": 0.25}),
        (5, 0, {"guardPct": 0.28}), (6, 0, {"guardPct": 0.30}),
        (7, 0, {"guardPct": 0.33}), (8, 0, {"guardPct": 0.35}),
        (9, 0, {"guardPct": 0.38}), (10, 0, {"guardPct": 0.40}),
    ],
    "mage.ember_fan": [
        (1, 24, {"burnPerTick": 3}), (2, 32, {"burnPerTick": 4}),
        (3, 41, {"burnPerTick": 5}), (4, 50, {"burnPerTick": 6}),
        (5, 60, {"burnPerTick": 7}), (6, 70, {"burnPerTick": 8}),
        (7, 80, {"burnPerTick": 9}), (8, 90, {"burnPerTick": 10}),
        (9, 101, {"burnPerTick": 11}), (10, 112, {"burnPerTick": 12}),
    ],
    "mage.ember_bolt": [
        (1, 20, {}), (2, 27, {}), (3, 34, {}), (4, 42, {}), (5, 50, {}),
        (6, 58, {}), (7, 66, {}), (8, 74, {}), (9, 83, {}), (10, 92, {}),
    ],
    "mage.blink": [
        (1, 0, {}), (2, 0, {}), (3, 0, {}), (4, 0, {}), (5, 0, {}),
        (6, 0, {}), (7, 0, {}), (8, 0, {}), (9, 0, {}), (10, 0, {}),
    ],
    "mage.frost_nova": [
        (1, 28, {"slowPct": 0.20}), (2, 37, {"slowPct": 0.23}),
        (3, 46, {"slowPct": 0.25}), (4, 56, {"slowPct": 0.28}),
        (5, 66, {"slowPct": 0.30}), (6, 76, {"slowPct": 0.33}),
        (7, 86, {"slowPct": 0.35}), (8, 97, {"slowPct": 0.38}),
        (9, 108, {"slowPct": 0.41}), (10, 120, {"slowPct": 0.45}),
    ],
    "mage.arc_surge": [
        (1, 32, {"chains": 1}), (2, 42, {"chains": 1}),
        (3, 52, {"chains": 2}), (4, 63, {"chains": 2}),
        (5, 74, {"chains": 2}), (6, 85, {"chains": 3}),
        (7, 96, {"chains": 3}), (8, 108, {"chains": 3}),
        (9, 120, {"chains": 3}), (10, 132, {"chains": 3}),
    ],
}

# (key, tier, name_en, name_zh, parents, effects)
# effect: ("stat", stat, mode, value) | ("flag", flag, value)
KNIGHT_PASSIVES = [
    ("iron_body", 1, "Iron Body", "铁躯", [], [("stat", "healthBonus", "add", 15)]),
    ("weapon_drill", 1, "Weapon Drill", "兵器操练", [], [("stat", "damagePct", "add", 0.05)]),
    ("thick_hide", 2, "Thick Hide", "厚皮", ["iron_body"], [("stat", "healthBonus", "add", 20)]),
    ("plated_stance", 2, "Plated Stance", "覆甲架势", ["iron_body"], [("stat", "armorPct", "add", 0.08)]),
    ("sharpened_edge", 2, "Sharpened Edge", "开刃", ["weapon_drill"], [("stat", "physicalDamagePct", "add", 0.07)]),
    ("measured_swing", 2, "Measured Swing", "沉稳挥击", ["weapon_drill"], [("stat", "attackSpeedPct", "add", 0.04)]),
    ("second_wind", 3, "Second Wind", "回气", ["thick_hide"], [("stat", "lifeRegenFlat", "add", 1.5)]),
    ("bulwark_training", 3, "Bulwark Training", "壁垒训练", ["plated_stance"], [("stat", "damageReductionPct", "add", 0.03)]),
    ("shield_mastery", 3, "Shield Mastery", "盾牌精通", ["plated_stance"], [("stat", "blockChance", "add", 0.05)]),
    ("heavy_blows", 3, "Heavy Blows", "重击", ["sharpened_edge"], [("stat", "damagePct", "add", 0.08)]),
    ("bleed_cut", 3, "Wide Cleave", "横扫", ["sharpened_edge"], [("flag", "cleave.extra_target", 1)]),
    ("quick_hands", 3, "Quick Hands", "快手", ["measured_swing"], [("stat", "attackSpeedPct", "add", 0.05)]),
    ("axe_training", 3, "Axe Training", "掷斧训练", ["measured_swing"], [("flag", "hurl_axe.bounce", 1)]),
    ("unyielding", 4, "Unyielding", "不屈", ["bulwark_training"], [("stat", "damageReductionPct", "add", 0.04)]),
    ("guard_drill", 4, "Guard Drill", "格挡操练", ["shield_mastery"], [("stat", "blockChance", "add", 0.06)]),
    ("executioner", 4, "Executioner", "处刑者", ["heavy_blows"], [("stat", "critPct", "add", 0.04)]),
    ("crushing", 4, "Crushing", "压碎", ["heavy_blows"], [("stat", "physicalDamagePct", "add", 0.10)]),
    ("momentum", 4, "Momentum", "势头", ["quick_hands"], [("stat", "movementSpeedPct", "add", 0.05)]),
    ("riposte", 4, "Riposte", "反击", ["shield_mastery"], [("stat", "critPct", "add", 0.03)]),
    ("tireless", 4, "Tireless", "不倦", ["second_wind"], [("stat", "lifeRegenFlat", "add", 2.0)]),
    ("cleave_arc", 4, "Long Arc", "长弧", ["bleed_cut"], [("flag", "cleave.range", 12)]),
    ("colossus", 5, "Colossus", "巨像", ["tireless"], [("stat", "healthBonus", "add", 40)]),
    ("impenetrable", 5, "Impenetrable", "不可穿透", ["unyielding"], [("stat", "armorPct", "add", 0.15)]),
    ("bloodlust", 5, "Bloodlust", "嗜血", ["executioner"], [("stat", "damagePct", "add", 0.12)]),
    ("shatter_guard", 5, "Shatter Guard", "碎防", ["crushing"], [("stat", "damagePct", "add", 0.10)]),
    ("swift_strikes", 5, "Swift Strikes", "迅击", ["momentum"], [("stat", "attackSpeedPct", "add", 0.08)]),
    ("counter_edge", 5, "Counter Edge", "反刃", ["riposte"], [("stat", "critMultiplierPct", "add", 0.15)]),
    ("bulwark_long", 5, "Lasting Bulwark", "持久壁垒", ["bulwark_training"], [("flag", "bulwark.duration", 30)]),
    ("lunge_far", 5, "Far Lunge", "远突", ["momentum"], [("flag", "lunge.range", 40)]),
    ("last_stand", 6, "Last Stand", "背水一战", ["colossus"], [("stat", "healthBonus", "add", 50)]),
    ("juggernaut", 6, "Juggernaut", "主宰", ["impenetrable"], [("stat", "damageReductionPct", "add", 0.05)]),
    ("warlord", 6, "Warlord", "战争领主", ["bloodlust"], [("stat", "damagePct", "add", 0.15)]),
    ("rage_flow", 6, "Rage Flow", "怒气涌流", ["bloodlust"], [("flag", "rage.gain", 2)]),
    ("endless_cleave", 6, "Endless Cleave", "无尽横扫", ["shatter_guard"], [("flag", "cleave.extra_target", 1)]),
    ("veteran", 6, "Veteran", "老兵", ["colossus"], [("stat", "healthBonus", "add", 25)]),
    ("shield_wall", 6, "Shield Wall", "盾墙", ["guard_drill"], [("flag", "shield_bash.stun", 0.1)]),
]

MAGE_PASSIVES = [
    ("mana_spring", 1, "Mana Spring", "灵泉", [], [("stat", "manaFlat", "add", 12)]),
    ("arcane_spark", 1, "Arcane Spark", "奥术火花", [], [("stat", "spellDamagePct", "add", 0.06)]),
    ("mana_flow", 2, "Mana Flow", "法力流动", ["mana_spring"], [("stat", "manaRegenPct", "add", 0.10)]),
    ("deep_reserve", 2, "Deep Reserve", "深层储备", ["mana_spring"], [("stat", "manaFlat", "add", 20)]),
    ("ember_affinity", 2, "Ember Affinity", "余烬亲和", ["arcane_spark"], [("stat", "fireResistance", "add", 0.08)]),
    ("frost_affinity", 2, "Frost Affinity", "霜寒亲和", ["arcane_spark"], [("stat", "coldResistance", "add", 0.08)]),
    ("flow_state", 3, "Flow State", "流态", ["mana_flow"], [("stat", "manaRegenPct", "add", 0.15)]),
    ("ward_weave", 3, "Ward Weave", "护盾编织", ["deep_reserve"], [("stat", "energyShieldPct", "add", 0.10)]),
    ("kindling", 3, "Kindling", "引燃", ["ember_affinity"], [("flag", "ember_fan.burn", 2)]),
    ("chill_touch", 3, "Chill Touch", "寒触", ["frost_affinity"], [("flag", "frost_nova.slow", 0.05)]),
    ("spark_focus", 3, "Spark Focus", "火花专注", ["arcane_spark"], [("stat", "spellDamagePct", "add", 0.08)]),
    ("quick_cast", 3, "Quick Cast", "快速施法", ["mana_flow"], [("stat", "attackSpeedPct", "add", 0.05)]),
    ("bolt_training", 3, "Bolt Training", "弹道训练", ["arcane_spark"], [("flag", "ember_bolt.pierce", 1)]),
    ("mana_shield", 4, "Mana Shield", "法力护盾", ["ward_weave"], [("stat", "energyShieldFlat", "add", 25)]),
    ("inferno", 4, "Inferno", "炼狱", ["kindling"], [("flag", "ember_fan.radius", 10)]),
    ("permafrost", 4, "Permafrost", "永冻", ["chill_touch"], [("flag", "frost_nova.radius", 10)]),
    ("storm_affinity", 4, "Storm Affinity", "风暴亲和", ["spark_focus"], [("stat", "lightningResistance", "add", 0.10)]),
    ("arc_mastery", 4, "Arc Mastery", "电弧精通", ["spark_focus"], [("flag", "arc_surge.chains", 1)]),
    ("haste_weave", 4, "Haste Weave", "迅捷编织", ["flow_state"], [("stat", "movementSpeedPct", "add", 0.05)]),
    ("elemental_focus", 4, "Elemental Focus", "元素专注", ["spark_focus"], [("stat", "spellDamagePct", "add", 0.10)]),
    ("bolt_pierce", 4, "Piercing Bolt", "穿透弹", ["bolt_training"], [("flag", "ember_bolt.pierce", 1)]),
    ("pyre", 5, "Pyre", "焚堆", ["inferno"], [("flag", "ember_fan.burn", 4)]),
    ("glacier", 5, "Glacier", "冰川", ["permafrost"], [("flag", "frost_nova.slow", 0.08)]),
    ("tempest", 5, "Tempest", "暴风", ["storm_affinity"], [("flag", "arc_surge.damage", 0.08)]),
    ("overload", 5, "Overload", "过载", ["elemental_focus"], [("stat", "spellDamagePct", "add", 0.12)]),
    ("bulwark_of_mana", 5, "Bulwark of Mana", "法力壁垒", ["mana_shield"], [("stat", "damageReductionPct", "add", 0.04)]),
    ("blink_mastery", 5, "Blink Mastery", "闪烁精通", ["haste_weave"], [("flag", "blink.distance", 40)]),
    ("frostfire", 5, "Frostfire", "霜火", ["kindling"], [("flag", "frost_nova.slow", 0.05)]),
    ("static_field", 5, "Static Field", "静电场", ["arc_mastery"], [("flag", "arc_surge.chains", 1)]),
    ("arcane_surge", 6, "Arcane Surge", "奥术涌动", ["overload"], [("stat", "manaRegenPct", "add", 0.20)]),
    ("phoenix", 6, "Phoenix", "不死鸟", ["pyre"], [("stat", "fireResistance", "add", 0.10)]),
    ("absolute_zero", 6, "Absolute Zero", "绝对零度", ["glacier"], [("stat", "coldResistance", "add", 0.10)]),
    ("thunderhead", 6, "Thunderhead", "雷首", ["static_field"], [("stat", "lightningResistance", "add", 0.10)]),
    ("arcane_ward", 6, "Arcane Ward", "奥术守卫", ["bulwark_of_mana"], [("stat", "energyShieldFlat", "add", 40)]),
    ("tempest_mastery", 6, "Tempest Mastery", "暴风精通", ["tempest"], [("flag", "arc_surge.damage", 0.10)]),
    ("mana_well", 6, "Mana Well", "法泉", ["overload"], [("stat", "manaFlat", "add", 40)]),
]

# Progression aligned with p9's current curve: nextXpFor(level) = 8 + 6*level.
PROGRESSION = {
    "maxLevel": 20,
    "xpFormula": {"base": 8, "perLevel": 6},
    "pointsPerLevel": 1,
    "milestoneBonus": [{"level": 5, "points": 1}, {"level": 10, "points": 1},
                       {"level": 15, "points": 1}, {"level": 20, "points": 1}],
}

ALLOWED_TAGS = {
    "melee", "ranged", "physical", "attack", "spell", "fire", "cold", "lightning",
    "projectile", "aoe", "cone", "movement", "guard", "dot", "burn", "chill",
    "stun", "shock", "rage", "chain", "blink", "point",
}
