#!/usr/bin/env python3
"""Normalize Path of Exile data exports (RePoE format) into p9 design-reference
summaries.

The raw exports are owned by Grinding Gear Games and are NOT redistributable;
this script therefore never copies display names, flavour/description text or
art paths.  It emits only self-named, aggregate/derived data:

  * item classes, representative base types (numeric fields only)
  * affix families -> tiers -> level requirement / roll range / spawn weight
  * stat taxonomy plus the base -> flat -> increased -> more aggregation model
  * skill gem / support gem structure and level-curve shape statistics
  * drop-level and affix-pool size tables

Usage:
    python3 tools/extract.py --data /tmp/poe-data/repoe-latest --out data
    python3 tools/extract.py --check            # validate schema.example.json

Standard library only.  Re-runnable: output is deterministic (sorted keys,
fixed source-date metadata) and every run prints the same statistics.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import statistics
import sys
from pathlib import Path

SCHEMA_ID = "p9.ref.poe/1"
SCHEMA_DOC = "research/poe/README.md"

# Data provenance.  The export is a snapshot; update these when re-downloading.
SOURCE = {
    "dataset": "RePoE (community GGPK export)",
    "repository": "https://github.com/repoe-fork/repoe",
    "hosted_export": "https://repoe-fork.github.io/",
    "upstream_commit": "aa9fa7c3",
    "export_http_last_modified": "2026-10-19T04:15:16Z",
    "game": "Path of Exile 1 (PC)",
    "redistribution": "raw data (c) Grinding Gear Games; not redistributed - aggregates only",
    "revision_note": "PoE1 3.2x-era snapshot; structure is what matters, exact numbers drift per league",
}

SLOT_BASES = {
    # canonical slot id -> (item class, excluded base tags)
    "ring": ("Ring", {"talisman", "not_for_sale"}),
    "amulet": ("Amulet", {"talisman", "not_for_sale"}),
    "belt": ("Belt", {"not_for_sale"}),
    "helmet": ("Helmet", set()),
    "body_armour": ("Body Armour", set()),
    "gloves": ("Gloves", set()),
    "boots": ("Boots", set()),
    "shield": ("Shield", set()),
    "quiver": ("Quiver", set()),
    "sword_1h": ("One Hand Sword", {"not_for_sale", "demigods"}),
    "axe_2h": ("Two Hand Axe", set()),
    "bow": ("Bow", set()),
    "staff": ("Staff", set()),
    "wand": ("Wand", set()),
}

# Self-named stat keys.  PoE stat ids are internal identifiers; we map the ones
# that occur in the normal prefix/suffix pool onto our own vocabulary.
STAT_MAP = {
    # life / mana / defences
    "base_maximum_life": ("life_flat", "single"),
    "maximum_life_+%": ("life_increased_pct", "single"),
    "base_maximum_mana": ("mana_flat", "single"),
    "maximum_mana_+%": ("mana_increased_pct", "single"),
    "base_maximum_energy_shield": ("energy_shield_flat", "single"),
    "maximum_energy_shield_+%": ("energy_shield_increased_pct", "single"),
    "local_energy_shield": ("energy_shield_flat_local", "single"),
    "local_base_physical_damage_reduction_rating": ("armour_flat_local", "single"),
    "local_physical_damage_reduction_rating_+%": ("armour_increased_pct_local", "single"),
    "base_physical_damage_reduction_rating": ("armour_flat", "single"),
    "physical_damage_reduction_rating_+%": ("armour_increased_pct", "single"),
    "base_evasion_rating": ("evasion_flat", "single"),
    "local_base_evasion_rating": ("evasion_flat_local", "single"),
    "evasion_rating_+%": ("evasion_increased_pct", "single"),
    "base_maximum_ward": ("ward_flat", "single"),
    "base_block_%": ("block_pct", "single"),
    "additional_block_%": ("block_pct_extra", "single"),
    "local_block_chance_+%": ("block_pct_local", "single"),
    "base_spell_block_%": ("spell_block_pct", "single"),
    "additional_spell_block_%": ("spell_block_pct_extra", "single"),
    "base_spell_suppression_chance_150%_of_value": ("spell_suppression_pct", "single"),
    # attributes
    "additional_strength": ("strength_flat", "single"),
    "additional_dexterity": ("dexterity_flat", "single"),
    "additional_intelligence": ("intelligence_flat", "single"),
    "additional_all_attributes": ("all_attributes_flat", "single"),
    "local_attribute_requirements_+%": ("attribute_requirements_pct", "single"),
    # resistances
    "base_fire_damage_resistance_%": ("fire_resistance_pct", "single"),
    "base_cold_damage_resistance_%": ("cold_resistance_pct", "single"),
    "base_lightning_damage_resistance_%": ("lightning_resistance_pct", "single"),
    "base_chaos_damage_resistance_%": ("chaos_resistance_pct", "single"),
    "base_resist_all_elements_%": ("elemental_resistance_pct", "single"),
    "base_maximum_fire_damage_resistance_%": ("fire_max_resistance_pct", "single"),
    "base_maximum_cold_damage_resistance_%": ("cold_max_resistance_pct", "single"),
    "base_maximum_lightning_damage_resistance_%": ("lightning_max_resistance_pct", "single"),
    "base_maximum_chaos_damage_resistance_%": ("chaos_max_resistance_pct", "single"),
    "additional_maximum_all_resistances_%": ("all_max_resistance_pct", "single"),
    # local weapon damage (applied before global modifiers)
    "local_physical_damage_+%": ("physical_damage_increased_pct_local", "single"),
    "local_minimum_added_physical_damage": ("added_physical_damage_local", "pair_min"),
    "local_maximum_added_physical_damage": ("added_physical_damage_local", "pair_max"),
    "local_minimum_added_fire_damage": ("added_fire_damage_local", "pair_min"),
    "local_maximum_added_fire_damage": ("added_fire_damage_local", "pair_max"),
    "local_minimum_added_cold_damage": ("added_cold_damage_local", "pair_min"),
    "local_maximum_added_cold_damage": ("added_cold_damage_local", "pair_max"),
    "local_minimum_added_lightning_damage": ("added_lightning_damage_local", "pair_min"),
    "local_maximum_added_lightning_damage": ("added_lightning_damage_local", "pair_max"),
    "local_minimum_added_chaos_damage": ("added_chaos_damage_local", "pair_min"),
    "local_maximum_added_chaos_damage": ("added_chaos_damage_local", "pair_max"),
    "local_attack_speed_+%": ("attack_speed_increased_pct_local", "single"),
    "local_critical_strike_chance_+%": ("crit_chance_increased_pct_local", "single"),
    "local_accuracy_rating": ("accuracy_flat_local", "single"),
    "local_life_gain_per_target": ("life_gain_on_hit_local", "single"),
    "local_life_leech_from_physical_damage_permyriad": ("life_leech_pct_local", "single"),
    "local_mana_leech_from_physical_damage_permyriad": ("mana_leech_pct_local", "single"),
    # added damage from skills / attacks / spells
    "attack_minimum_added_physical_damage": ("added_physical_damage_attack", "pair_min"),
    "attack_maximum_added_physical_damage": ("added_physical_damage_attack", "pair_max"),
    "attack_minimum_added_fire_damage": ("added_fire_damage_attack", "pair_min"),
    "attack_maximum_added_fire_damage": ("added_fire_damage_attack", "pair_max"),
    "attack_minimum_added_cold_damage": ("added_cold_damage_attack", "pair_min"),
    "attack_maximum_added_cold_damage": ("added_cold_damage_attack", "pair_max"),
    "attack_minimum_added_lightning_damage": ("added_lightning_damage_attack", "pair_min"),
    "attack_maximum_added_lightning_damage": ("added_lightning_damage_attack", "pair_max"),
    "attack_minimum_added_chaos_damage": ("added_chaos_damage_attack", "pair_min"),
    "attack_maximum_added_chaos_damage": ("added_chaos_damage_attack", "pair_max"),
    "spell_minimum_added_physical_damage": ("added_physical_damage_spell", "pair_min"),
    "spell_maximum_added_physical_damage": ("added_physical_damage_spell", "pair_max"),
    "spell_minimum_added_fire_damage": ("added_fire_damage_spell", "pair_min"),
    "spell_maximum_added_fire_damage": ("added_fire_damage_spell", "pair_max"),
    "spell_minimum_added_cold_damage": ("added_cold_damage_spell", "pair_min"),
    "spell_maximum_added_cold_damage": ("added_cold_damage_spell", "pair_max"),
    "spell_minimum_added_lightning_damage": ("added_lightning_damage_spell", "pair_min"),
    "spell_maximum_added_lightning_damage": ("added_lightning_damage_spell", "pair_max"),
    "spell_minimum_added_chaos_damage": ("added_chaos_damage_spell", "pair_min"),
    "spell_maximum_added_chaos_damage": ("added_chaos_damage_spell", "pair_max"),
    # flat damage taken / added as element
    "physical_damage_%_to_add_as_fire": ("physical_to_fire_pct", "single"),
    "physical_damage_%_to_add_as_cold": ("physical_to_cold_pct", "single"),
    "physical_damage_%_to_add_as_lightning": ("physical_to_lightning_pct", "single"),
    "physical_damage_%_to_add_as_chaos": ("physical_to_chaos_pct", "single"),
    # global offensive stats
    "physical_damage_+%": ("physical_damage_increased_pct", "single"),
    "fire_damage_+%": ("fire_damage_increased_pct", "single"),
    "cold_damage_+%": ("cold_damage_increased_pct", "single"),
    "lightning_damage_+%": ("lightning_damage_increased_pct", "single"),
    "chaos_damage_+%": ("chaos_damage_increased_pct", "single"),
    "elemental_damage_+%": ("elemental_damage_increased_pct", "single"),
    "spell_damage_+%": ("spell_damage_increased_pct", "single"),
    "minion_damage_+%": ("minion_damage_increased_pct", "single"),
    "damage_+%_with_bow_skills": ("bow_damage_increased_pct", "single"),
    "elemental_damage_with_attack_skills_+%": ("elemental_attack_damage_increased_pct", "single"),
    "attack_speed_+%": ("attack_speed_increased_pct", "single"),
    "base_cast_speed_+%": ("cast_speed_increased_pct", "single"),
    "critical_strike_chance_+%": ("crit_chance_increased_pct", "single"),
    "spell_critical_strike_chance_+%": ("spell_crit_chance_increased_pct", "single"),
    "bow_critical_strike_chance_+%": ("bow_crit_chance_increased_pct", "single"),
    "base_critical_strike_multiplier_+": ("crit_multiplier_flat", "single"),
    "bow_critical_strike_multiplier_+": ("bow_crit_multiplier_flat", "single"),
    "base_self_critical_strike_multiplier_-%": ("self_crit_multiplier_reduction_pct", "single"),
    "accuracy_rating": ("accuracy_flat", "single"),
    "accuracy_rating_+%": ("accuracy_increased_pct", "single"),
    "dot_multiplier_+": ("dot_multiplier_flat", "single"),
    "physical_dot_multiplier_+": ("physical_dot_multiplier_flat", "single"),
    "fire_dot_multiplier_+": ("fire_dot_multiplier_flat", "single"),
    "cold_dot_multiplier_+": ("cold_dot_multiplier_flat", "single"),
    "chaos_dot_multiplier_+": ("chaos_dot_multiplier_flat", "single"),
    "damage_over_time_multiplier_+_with_attacks": ("dot_multiplier_with_attacks_flat", "single"),
    "base_skill_area_of_effect_+%": ("area_of_effect_increased_pct", "single"),
    "base_projectile_speed_+%": ("projectile_speed_increased_pct", "single"),
    "number_of_additional_arrows": ("additional_arrows", "single"),
    "base_chance_to_ignite_%": ("ignite_chance_pct", "single"),
    "base_chance_to_freeze_%": ("freeze_chance_pct", "single"),
    "base_chance_to_shock_%": ("shock_chance_pct", "single"),
    "avoid_all_elemental_status_%": ("avoid_elemental_ailment_pct", "single"),
    "base_stun_recovery_+%": ("stun_recovery_increased_pct", "single"),
    "base_stun_threshold_reduction_+%": ("stun_threshold_reduction_pct", "single"),
    "base_stun_duration_+%": ("stun_duration_increased_pct", "single"),
    # sustain
    "life_regeneration_rate_+%": ("life_regen_increased_pct", "single"),
    "base_life_regeneration_rate_per_minute": ("life_regen_per_min_pct", "single"),
    "mana_regeneration_rate_+%": ("mana_regen_increased_pct", "single"),
    "life_leech_from_physical_attack_damage_permyriad": ("life_leech_pct_physical_attack", "single"),
    "mana_leech_from_physical_attack_damage_permyriad": ("mana_leech_pct_physical_attack", "single"),
    "base_life_gain_per_target": ("life_gain_on_hit_flat", "single"),
    "base_life_gained_on_enemy_death": ("life_gain_on_kill_flat", "single"),
    "base_mana_gained_on_enemy_death": ("mana_gain_on_kill_flat", "single"),
    "base_movement_velocity_+%": ("movement_speed_increased_pct", "single"),
    # item / flask / misc
    "base_item_found_rarity_+%": ("item_rarity_increased_pct", "single"),
    "light_radius_+%": ("light_radius_increased_pct", "single"),
    "charges_gained_+%": ("charge_gain_increased_pct", "single"),
    "flask_duration_+%": ("flask_duration_increased_pct", "single"),
    "flask_effect_+%": ("flask_effect_increased_pct", "single"),
    "flask_life_recovery_rate_+%": ("flask_life_recovery_increased_pct", "single"),
    "flask_mana_recovery_rate_+%": ("flask_mana_recovery_increased_pct", "single"),
    "flask_charges_used_+%": ("flask_charges_used_increased_pct", "single"),
    "base_additional_physical_damage_reduction_%": ("physical_damage_reduction_pct", "single"),
    "damage_taken_goes_to_life_over_4_seconds_%": ("damage_taken_to_life_pct", "single"),
    "physical_damage_to_return_to_melee_attacker": ("reflect_physical_damage_flat", "single"),
    # gem level / skill modifiers
    "local_socketed_gem_level_+": ("socketed_gem_level_bonus", "single"),
    "local_socketed_melee_gem_level_+": ("socketed_melee_gem_level_bonus", "single"),
    "local_socketed_bow_gem_level_+": ("socketed_bow_gem_level_bonus", "single"),
    "spell_skill_gem_level_+": ("spell_gem_level_bonus", "single"),
    "minion_skill_gem_level_+": ("minion_gem_level_bonus", "single"),
    "all_skill_gem_level_+": ("all_gem_level_bonus", "single"),
    "fire_skill_gem_level_+": ("fire_gem_level_bonus", "single"),
    "cold_skill_gem_level_+": ("cold_gem_level_bonus", "single"),
    "lightning_skill_gem_level_+": ("lightning_gem_level_bonus", "single"),
    "physical_skill_gem_level_+": ("physical_gem_level_bonus", "single"),
    "chaos_skill_gem_level_+": ("chaos_gem_level_bonus", "single"),
    "fire_spell_skill_gem_level_+": ("fire_spell_gem_level_bonus", "single"),
    "cold_spell_skill_gem_level_+": ("cold_spell_gem_level_bonus", "single"),
    "lightning_spell_skill_gem_level_+": ("lightning_spell_gem_level_bonus", "single"),
    "physical_spell_skill_gem_level_+": ("physical_spell_gem_level_bonus", "single"),
    "chaos_spell_skill_gem_level_+": ("chaos_spell_gem_level_bonus", "single"),
    "dummy_stat_display_nothing": ("display_only", "single"),
}

# Unit + stacking semantics for the normalized keys (used by p9 when building
# its own modifier pipeline).  Anything not listed is inferred from the suffix.
UNIT_RULES = [
    ("_permyriad", "permyriad", "flat"),          # 10000 == 100 %
    ("_per_min_pct", "percent_per_minute", "flat"),
    ("_pct_local", "percent_local", "increased"),
    ("_local", "flat_local", "flat"),
    ("_pct", "percent", "increased"),
    ("_flat", "integer", "flat"),
]

SLOT_ORDER = list(SLOT_BASES)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def read_json(path: Path):
    with path.open() as fh:
        return json.load(fh)


def ordered_weight(mod, tags):
    """RePoE semantics: first spawn_weights entry whose tag the item has wins."""
    for entry in mod["spawn_weights"]:
        if entry["tag"] in tags:
            return entry["weight"]
    return 0


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pct(value: float) -> str:
    return f"{value:.1f}%"


def quantile(values, q):
    if not values:
        return None
    return round(statistics.quantiles(values, n=100)[q - 1], 3)


def median(values):
    return round(statistics.median(values), 3) if values else None


def log_log_fit(pairs):
    """Fit y = a * x^b by least squares in log space."""
    pairs = [(x, y) for x, y in pairs if x > 0 and y > 0]
    if len(pairs) < 4:
        return None
    xs = [math.log(x) for x, _ in pairs]
    ys = [math.log(y) for _, y in pairs]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return None
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom
    a = math.exp(my - b * mx)
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (math.log(a) + b * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot else 0
    return {"a": round(a, 3), "b": round(b, 3), "r2": round(r2, 3), "n": len(pairs)}


def stat_parts(stat_id):
    """Return (normalized_key, part) or None."""
    hit = STAT_MAP.get(stat_id)
    if hit:
        return hit
    return None


def unit_for(key):
    for suffix, unit, stack in UNIT_RULES:
        if key.endswith(suffix):
            return unit, stack
    return "integer", "flat"


# --------------------------------------------------------------------------- #
# base types
# --------------------------------------------------------------------------- #

def pick_representatives(base_items):
    reps = {}
    for key, item in base_items.items():
        if item.get("domain") != "item" or item.get("release_state") != "released":
            continue
        for slot, (cls, excluded) in SLOT_BASES.items():
            if item.get("item_class") != cls:
                continue
            if excluded & set(item.get("tags") or []):
                continue
            cur = reps.get(slot)
            if cur is None or item["drop_level"] < cur["drop_level"]:
                reps[slot] = item
    missing = [s for s in SLOT_BASES if s not in reps]
    if missing:
        raise SystemExit(f"no representative base for slots: {missing}")
    return reps


def prop(item, name):
    value = (item.get("properties") or {}).get(name)
    if isinstance(value, dict):
        return [value["min"], value["max"]]
    return value


def base_types_section(base_items, reps):
    classes = collections.defaultdict(list)
    for item in base_items.values():
        if item.get("domain") != "item" or item.get("release_state") != "released":
            continue
        classes[item["item_class"]].append(item)

    aggregate = []
    for cls, items in sorted(classes.items()):
        if len(items) < 5:
            continue
        levels = [i["drop_level"] for i in items]
        attr = []
        for i in items:
            req = i.get("requirements") or {}
            attr.append(max(req.get("strength") or 0, req.get("dexterity") or 0, req.get("intelligence") or 0))
        implicits = [len(i.get("implicits") or []) for i in items]
        aggregate.append({
            "class": cls.lower().replace(" ", "_"),
            "base_count": len(items),
            "drop_level": {"min": min(levels), "max": max(levels), "median": median(levels)},
            "attribute_requirement": {
                "min": min(attr), "max": max(attr), "median": median(attr),
            },
            "implicit_count": dict(sorted(collections.Counter(implicits).items())),
        })

    representative = []
    for slot in SLOT_ORDER:
        item = reps[slot]
        representative.append({
            "id": f"base.{slot}.t0",
            "slot": slot,
            "class": item["item_class"].lower().replace(" ", "_"),
            "drop_level": item["drop_level"],
            "tags": sorted(item.get("tags") or []),
            "requirements": item.get("requirements"),
            "inventory": [item.get("inventory_width"), item.get("inventory_height")],
            "implicit_count": len(item.get("implicits") or []),
            "defence": {
                k: prop(item, k)
                for k in ("armour", "evasion", "energy_shield", "ward")
                if prop(item, k) is not None
            },
            "weapon": {
                k: prop(item, k)
                for k in ("physical_damage_min", "physical_damage_max",
                          "attack_time", "critical_strike_chance", "range")
                if prop(item, k) is not None
            } or None,
            "movement_speed_penalty": prop(item, "movement_speed"),
        })

    return {"classes": aggregate, "representative_bases": representative}


def scaling_section(base_items, reps):
    """Fit base value ~ a * drop_level^b for defence / weapon dps."""
    released = [i for i in base_items.values()
                if i.get("domain") == "item" and i.get("release_state") == "released"]

    def fit_for(item_class, extractor):
        pairs = []
        for i in released:
            if i.get("item_class") != item_class:
                continue
            v = extractor(i)
            if v is not None and v > 0:
                pairs.append((i["drop_level"], v))
        return log_log_fit(pairs)

    def armour(i):
        return (prop(i, "armour") or [None])[1] if prop(i, "armour") else None

    def evasion(i):
        return (prop(i, "evasion") or [None])[1] if prop(i, "evasion") else None

    def es(i):
        return (prop(i, "energy_shield") or [None])[1] if prop(i, "energy_shield") else None

    def dps(i):
        lo, hi = prop(i, "physical_damage_min"), prop(i, "physical_damage_max")
        atk = prop(i, "attack_time")
        if lo is None or hi is None or not atk:
            return None
        return ((lo + hi) / 2) / (atk / 1000.0)

    out = []
    for cls in ("Body Armour", "Helmet", "Gloves", "Boots", "Shield"):
        for name, fn in (("armour", armour), ("evasion", evasion), ("energy_shield", es)):
            fit = fit_for(cls, fn)
            if fit:
                out.append({"class": cls.lower().replace(" ", "_"), "property": name, **fit})
    for cls in ("One Hand Sword", "Two Hand Axe", "Bow", "Wand", "Staff"):
        fit = fit_for(cls, dps)
        if fit:
            out.append({"class": cls.lower().replace(" ", "_"), "property": "physical_dps", **fit})
    for cls in ("Body Armour", "Helmet", "Shield"):
        def attr(i):
            return max((i.get("requirements") or {}).get(k) or 0
                       for k in ("strength", "dexterity", "intelligence"))
        fit = fit_for(cls, attr)
        if fit:
            out.append({"class": cls.lower().replace(" ", "_") + "_requirement",
                        "property": "attribute_requirement", **fit})
    return out


# --------------------------------------------------------------------------- #
# affixes
# --------------------------------------------------------------------------- #

def collect_affixes(mods, reps):
    slot_tags = {slot: set(reps[slot].get("tags") or []) for slot in SLOT_ORDER}
    normal = []
    for mod_id, mod in mods.items():
        if mod.get("domain") != "item":
            continue
        if mod.get("generation_type") not in ("prefix", "suffix"):
            continue
        if mod.get("is_essence_only"):
            continue
        weights = {}
        for slot in SLOT_ORDER:
            w = ordered_weight(mod, slot_tags[slot])
            if w > 0:
                weights[slot] = w
        if not weights:
            continue
        normal.append((mod_id, mod, weights))

    families = collections.OrderedDict()
    unmapped_stats = collections.Counter()
    for mod_id, mod, weights in normal:
        merged = {}
        primary = None
        for stat in mod.get("stats") or []:
            mapped = stat_parts(stat["id"])
            if mapped is None:
                unmapped_stats[stat["id"]] += 1
                continue
            key, part = mapped
            entry = merged.setdefault(key, {"min": None, "max": None})
            if part == "pair_min":
                entry["min"] = stat["min"]
            elif part == "pair_max":
                entry["max"] = stat["max"]
            else:
                entry["min"] = stat["min"]
                entry["max"] = stat["max"]
            if primary is None and key != "display_only":
                primary = key
        if primary is None:
            continue
        slot_set = tuple(s for s in SLOT_ORDER if s in weights)
        fam_key = (mod["generation_type"], primary, slot_set)
        fam = families.setdefault(fam_key, {
            "kind": mod["generation_type"],
            "stat": primary,
            "slots": list(slot_set),
            "tiers_raw": [],
        })
        fam["tiers_raw"].append({
            "ilvl": mod["required_level"],
            "stats": merged,
            "weights": weights,
        })

    out = []
    for idx, ((kind, stat, slots), fam) in enumerate(sorted(families.items())):
        tiers_raw = sorted(fam["tiers_raw"], key=lambda t: t["ilvl"])
        tiers = []
        tier_no = 0
        by_level = collections.OrderedDict()
        for t in tiers_raw:
            by_level.setdefault(t["ilvl"], []).append(t)
        for ilvl, variants in by_level.items():
            tier_no += 1
            stats = {}
            for v in variants:
                for key, rng in v["stats"].items():
                    if key not in stats:
                        stats[key] = {"min": rng["min"], "max": rng["max"]}
                    else:
                        if rng["min"] is not None:
                            stats[key]["min"] = (rng["min"] if stats[key]["min"] is None
                                                 else min(stats[key]["min"], rng["min"]))
                        if rng["max"] is not None:
                            stats[key]["max"] = (rng["max"] if stats[key]["max"] is None
                                                 else max(stats[key]["max"], rng["max"]))
            slot_weight = {}
            for slot in slots:
                slot_weight[slot] = max(v["weights"].get(slot, 0) for v in variants)
            tiers.append({
                "tier": tier_no,
                "ilvl": ilvl,
                "stats": stats,
                "slot_weight": slot_weight,
                "variants": len(variants),
            })

        primary_first = tiers[0]["stats"].get(stat, {})
        primary_last = tiers[-1]["stats"].get(stat, {})
        ratio = None
        if primary_first.get("max") and primary_last.get("max"):
            ratio = round(primary_last["max"] / primary_first["max"], 2)
        span = tiers[-1]["ilvl"] - tiers[0]["ilvl"] if len(tiers) > 1 else 0
        out.append({
            "id": f"{kind}.{stat}.{idx:03d}",
            "kind": kind,
            "stat": stat,
            "slots": slots,
            "tier_count": len(tiers),
            "ilvl_range": [tiers[0]["ilvl"], tiers[-1]["ilvl"]],
            "value_growth": {
                "first_tier_max": primary_first.get("max"),
                "last_tier_max": primary_last.get("max"),
                "ratio": ratio,
                "avg_ilvl_step": round(span / max(len(tiers) - 1, 1), 2),
            },
            "tiers": tiers,
        })

    out.sort(key=lambda f: (f["kind"], f["stat"], -f["tier_count"], f["id"]))
    return out, unmapped_stats, normal


def affix_pool_tables(normal, reps):
    slot_tags = {slot: set(reps[slot].get("tags") or []) for slot in SLOT_ORDER}
    rows = []
    for ilvl in (1, 10, 20, 30, 40, 50, 60, 70, 83, 100):
        for slot in SLOT_ORDER:
            counts = {"prefix": 0, "suffix": 0}
            weights = {"prefix": 0, "suffix": 0}
            for mod_id, mod, _ in normal:
                if mod["required_level"] > ilvl:
                    continue
                w = ordered_weight(mod, slot_tags[slot])
                if w > 0:
                    counts[mod["generation_type"]] += 1
                    weights[mod["generation_type"]] += w
            rows.append({
                "ilvl": ilvl,
                "slot": slot,
                "prefix_count": counts["prefix"],
                "suffix_count": counts["suffix"],
                "prefix_weight_total": weights["prefix"],
                "suffix_weight_total": weights["suffix"],
            })
    return rows


def tier_probabilities(families, slot, ilvl):
    rows = []
    for fam in families:
        if slot not in fam["slots"]:
            continue
        eligible = [t for t in fam["tiers"] if t["ilvl"] <= ilvl]
        if len(eligible) < 3:
            continue
        total = sum(t["slot_weight"].get(slot, 0) for t in eligible)
        if total <= 0:
            continue
        top = eligible[-1]
        rows.append({
            "family": fam["id"],
            "stat": fam["stat"],
            "eligible_tiers": len(eligible),
            "top_tier": top["tier"],
            "top_tier_chance": round(top["slot_weight"].get(slot, 0) / total, 4),
        })
    rows.sort(key=lambda r: r["top_tier_chance"])
    return rows


# --------------------------------------------------------------------------- #
# stats model
# --------------------------------------------------------------------------- #

def stats_section(stats, families):
    total = len(stats)
    local = sum(1 for s in stats.values() if s.get("is_local"))
    aliased = sum(1 for s in stats.values() if s.get("is_aliased"))
    scalable = sum(1 for s in stats.values() if s.get("is_scalable"))

    observed = collections.defaultdict(lambda: {"tier_min": None, "tier_max": None,
                                                "families": 0, "kind": set()})
    for fam in families:
        entry = observed[fam["stat"]]
        entry["families"] += 1
        entry["kind"].add(fam["kind"])
        for tier in fam["tiers"]:
            rng = tier["stats"].get(fam["stat"])
            if not rng or rng["min"] is None or rng["max"] is None:
                continue
            entry["tier_min"] = rng["min"] if entry["tier_min"] is None else min(entry["tier_min"], rng["min"])
            entry["tier_max"] = rng["max"] if entry["tier_max"] is None else max(entry["tier_max"], rng["max"])

    catalog = []
    for key in sorted(observed):
        unit, stack = unit_for(key)
        entry = observed[key]
        catalog.append({
            "key": key,
            "unit": unit,
            "stack_mode": stack,
            "affix_kinds": sorted(entry["kind"]),
            "family_count": entry["families"],
            "observed_range": [entry["tier_min"], entry["tier_max"]],
        })

    model = {
        "pipeline": [
            "base := base_type_value(ilvl) * (1 + local_quality_bonus)",
            "flat := base + sum(flat_adds)  # local flat affixes already folded into base",
            "increased := 1 + sum(increased_%)  # all 'increased' sources add together",
            "more := product(1 + more_i)  # each 'more' source multiplies separately",
            "final := floor(flat * increased * more + 0.5)",
        ],
        "notes": [
            "local_* modifiers apply to the item's own base value before global modifiers",
            "defence/weapon damage is recomputed from base each time, never compounded",
            "resistance cap and max-resistance raises are separate stats",
            "speed/attack-time uses 1000/rate_ms so multipliers compose as rates",
        ],
        "evidence": {
            "stat_ids_total": total,
            "stat_ids_local": local,
            "stat_ids_aliased_by_hand": aliased,
            "stat_ids_scalable": scalable,
        },
    }
    return {"aggregation_model": model, "catalog": catalog}


# --------------------------------------------------------------------------- #
# skills
# --------------------------------------------------------------------------- #

def gem_curve(gem, levels, field):
    out = []
    for lvl in levels:
        entry = (gem.get("per_level") or {}).get(str(lvl))
        if entry is None:
            out.append(None)
            continue
        if field == "damage_multiplier":
            out.append(entry.get("damage_multiplier"))
        elif field == "mana":
            costs = entry.get("costs") or {}
            out.append(costs.get("Mana"))
        elif field == "required_level":
            out.append(entry.get("required_level"))
        elif field == "attribute_requirement":
            req = entry.get("stat_requirements") or {}
            vals = [v for v in req.values() if v]
            out.append(max(vals) if vals else 0)
    return out


def skills_section(gems):
    actives = [(k, v) for k, v in gems.items() if not v.get("is_support") and v.get("per_level")]
    supports = [(k, v) for k, v in gems.items() if v.get("is_support")]

    type_freq = collections.Counter()
    tag_freq = collections.Counter()
    for _, gem in actives:
        for t in (gem.get("active_skill") or {}).get("types") or []:
            type_freq[t] += 1
    for _, gem in gems.items():
        for t in gem.get("tags") or []:
            tag_freq[t] += 1

    levels = [1, 5, 10, 15, 20]
    curves = {f: [] for f in ("damage_multiplier", "mana", "required_level", "attribute_requirement")}
    for _, gem in actives:
        if not all(str(l) in (gem.get("per_level") or {}) for l in levels):
            continue
        for field in curves:
            vals = gem_curve(gem, levels, field)
            if all(v is not None for v in vals):
                curves[field].append(vals)

    summary_curves = {}
    for field, rows in curves.items():
        summary_curves[field] = [
            {"gem_level": lvl, "median": median([r[i] for r in rows]) if rows else None}
            for i, lvl in enumerate(levels)
        ]
        summary_curves[field + "_n"] = len(rows)

    ratios = [r[4] / r[0] for r in curves["damage_multiplier"] if r[0]]
    mana_ratios = [b / a for a, b in ((r[0], r[4]) for r in curves["mana"]) if a]

    # Structural archetypes: one representative per behaviour tag, numeric only.
    def primary_curve(gem, levels):
        """Damage-curve shape from the first base/added damage stat on the gem."""
        order = gem.get("tooltip_order") or []
        ref = (gem.get("per_level") or {}).get("1")
        if not order or not ref:
            return None
        index = 0
        target = None
        for group in order:
            ids = group.split("\n")
            for sid in ids:
                low = sid.lower()
                if ("damage" in low and ("base_" in low or "added_" in low or "minimum" in low)
                        and not any(x in low for x in ("taken", "convert", "penetrat", "reduction", "return"))):
                    target = index
                    break
                index += 1
            if target is not None:
                break
        if target is None:
            return None
        vals = []
        for lvl in levels:
            entry = (gem.get("per_level") or {}).get(str(lvl))
            stats = (entry or {}).get("stats") or []
            cell = stats[target] if target < len(stats) else None
            vals.append(cell.get("value") if isinstance(cell, dict) else None)
        if any(v is None for v in vals) or not vals[0]:
            return None
        if vals[-1] <= vals[0] or vals[-1] / vals[0] > 300:
            return None
        return {
            "raw": vals,
            "ratio_to_lvl1": [round(v / vals[0], 2) for v in vals],
        }

    def has_scaling(gem):
        per_level = gem.get("per_level") or {}
        if per_level.get("1", {}).get("damage_multiplier") is not None:
            return True
        if primary_curve(gem, [1, 10, 20]) is not None:
            return True
        first, tenth = per_level.get("1") or {}, per_level.get("10") or {}
        for a, b in zip(first.get("stats") or [], tenth.get("stats") or []):
            if isinstance(a, dict) and isinstance(b, dict) and a.get("value") != b.get("value"):
                return True
        return False

    archetypes = []
    wanted = [
        ("melee_strike", ("Melee", "Attack"), ("Slam", "Area", "Travel")),
        ("melee_slam_area", ("Melee", "Slam"), ("Movement",)),
        ("projectile_spell", ("Projectile", "Spell"), ("Attack",)),
        ("projectile_attack", ("Projectile", "Attack"), ("Spell",)),
        ("aura", ("Aura",), ("Attack",)),
        ("curse", ("AppliesCurse",), ()),
        ("minion", ("CreatesMinion",), ()),
        ("movement", ("Movement",), ()),
        ("duration_dot", ("Duration", "DamageOverTime"), ("Attack",)),
        ("channel", ("Channelling",), ()),
        ("totem", ("Totemable", "Spell"), ()),
        ("trap", ("Trappable", "Spell"), ()),
        ("guard", ("Guard",), ()),
        ("warcry", ("Warcry",), ()),
    ]
    used = set()
    for name, required, excluded in wanted:
        for key, gem in actives:
            if key in used:
                continue
            types = set((gem.get("active_skill") or {}).get("types") or [])
            if not set(required) <= types or set(excluded) & types:
                continue
            if not all(str(l) in gem["per_level"] for l in (1, 10, 20)):
                continue
            if not has_scaling(gem):
                continue
            used.add(key)
            archetypes.append({
                "id": f"skill.{name}.01",
                "role": name,
                "color": gem.get("color"),
                "cast_time_ms": gem.get("cast_time"),
                "max_level": (gem.get("base_item") or {}).get("max_level"),
                "types": sorted(types),
                "damage_effectiveness_pct": (gem.get("static") or {}).get("damage_effectiveness"),
                "curves": {
                    "damage_multiplier_per_10k": [
                        (gem["per_level"][str(l)].get("damage_multiplier"))
                        for l in (1, 5, 10, 15, 20)
                        if str(l) in gem["per_level"]
                    ],
                    "mana": [
                        ((gem["per_level"][str(l)].get("costs") or {}).get("Mana"))
                        for l in (1, 5, 10, 15, 20)
                        if str(l) in gem["per_level"]
                    ],
                    "required_level": [
                        gem["per_level"][str(l)].get("required_level")
                        for l in (1, 5, 10, 15, 20)
                        if str(l) in gem["per_level"]
                    ],
                    "primary_stat": primary_curve(gem, [1, 5, 10, 15, 20]),
                },
            })
            break

    allowed_combos = collections.Counter()
    excluded = 0
    cost_multipliers = collections.Counter()
    quality_counts = collections.Counter()
    for _, gem in supports:
        sg = gem.get("support_gem") or {}
        allowed_combos[tuple(sorted(sg.get("allowed_types") or []))] += 1
        if sg.get("excluded_types"):
            excluded += 1
        static = gem.get("static") or {}
        if static.get("cost_multiplier") is not None:
            cost_multipliers[static["cost_multiplier"]] += 1
    for _, gem in gems.items():
        quality_counts[len((gem.get("static") or {}).get("quality_stats") or [])] += 1

    support_rows = [
        {"allowed_type_count": len(combo), "allowed_types": list(combo), "gem_count": n}
        for combo, n in allowed_combos.most_common(12)
    ]

    return {
        "counts": {
            "gems_total": len(gems),
            "active": len(actives),
            "support": len(supports),
            "color": dict(sorted(collections.Counter(
                gem.get("color") for gem in gems.values()).items(),
                key=lambda kv: str(kv[0]))),
            "max_level": {str(k): v for k, v in sorted(
                collections.Counter(
                    (gem.get("base_item") or {}).get("max_level") for gem in gems.values()
                ).items(), key=lambda kv: str(kv[0]))},
        },
        "active_types": [{"type": t, "gem_count": n} for t, n in type_freq.most_common()],
        "gem_tags": [{"tag": t, "gem_count": n} for t, n in tag_freq.most_common(40)],
        "level_curve_medians": summary_curves,
        "damage_growth_ratio_lvl1_to_20": {
            "median": median(ratios),
            "p25": quantile(ratios, 25),
            "p75": quantile(ratios, 75),
            "n": len(ratios),
        },
        "mana_growth_ratio_lvl1_to_20": {
            "median": median(mana_ratios),
            "n": len(mana_ratios),
        },
        "cast_time_ms": {str(k): v for k, v in sorted(
            collections.Counter(gem.get("cast_time") for gem in gems.values()).items(),
            key=lambda kv: str(kv[0]))},
        "weapon_restriction_buckets": dict(sorted(
            collections.Counter(
                len((gem.get("active_skill") or {}).get("weapon_restrictions") or [])
                for gem in gems.values()
            ).items())),
        "archetypes": archetypes,
        "support_rules": {
            "support_gem_count": len(supports),
            "supports_with_excluded_types": excluded,
            "allowed_type_combinations": support_rows,
            "cost_multiplier": {str(k): v for k, v in sorted(cost_multipliers.items())},
            "quality_stat_count_distribution": {str(k): v for k, v in sorted(quality_counts.items())},
        },
    }


# --------------------------------------------------------------------------- #
# drops / economy
# --------------------------------------------------------------------------- #

def drops_section(base_items, normal, families, reps):
    equipment = [i for i in base_items.values()
                 if i.get("domain") == "item" and i.get("release_state") == "released"]
    buckets = collections.Counter(i["drop_level"] // 10 * 10 for i in equipment)

    currency = [i for i in base_items.values() if i.get("item_class") == "StackableCurrency"]
    stack_sizes = collections.Counter()
    tab_sizes = collections.Counter()
    for item in currency:
        props = item.get("properties") or {}
        size = props.get("stack_size")
        if isinstance(size, dict):
            size = size.get("max")
        if isinstance(size, int):
            stack_sizes[size] += 1
        tab = props.get("stack_size_currency_tab")
        if isinstance(tab, int):
            tab_sizes[tab] += 1

    weight_hist = collections.Counter()
    for _, mod, weights in normal:
        for w in weights.values():
            weight_hist[w] += 1

    implicit_counts = collections.Counter(
        len(i.get("implicits") or []) for i in equipment)

    tier_dist = collections.Counter(f["tier_count"] for f in families)

    return {
        "base_drop_level_buckets": {str(k): v for k, v in sorted(buckets.items())},
        "base_item_count": len(equipment),
        "implicit_count_distribution": {str(k): v for k, v in sorted(implicit_counts.items())},
        "currency": {
            "stackable_base_count": len(currency),
            "stack_size_histogram": {str(k): v for k, v in sorted(stack_sizes.items())},
            "currency_tab_stack_size": {str(k): v for k, v in sorted(tab_sizes.items())},
        },
        "affix_spawn_weight_histogram": {str(k): v for k, v in sorted(weight_hist.items())},
        "affix_family_tier_count_distribution": {str(k): v for k, v in sorted(tier_dist.items())},
        "affix_pool_by_ilvl": affix_pool_tables(normal, reps),
        "top_tier_probability_ring_ilvl83": tier_probabilities(families, "ring", 83),
        "monster_stat_scaling": None,  # filled by caller
    }


def monster_scaling_section(monster_stats):
    rows = {int(k): v for k, v in monster_stats.items()}
    fits = {}
    for stat in ("life", "physical_damage", "armour", "evasion", "accuracy"):
        pairs = [(lvl, rows[lvl][stat]) for lvl in sorted(rows)
                 if 1 <= lvl <= 83 and rows[lvl].get(stat)]
        fits[stat] = log_log_fit(pairs)
    sample_levels = [1, 10, 20, 40, 60, 83, 100]
    samples = [
        {"level": lvl, **{k: rows[lvl][k] for k in
                          ("life", "physical_damage", "armour", "evasion", "accuracy")
                          if k in rows[lvl]}}
        for lvl in sample_levels if lvl in rows
    ]
    return {
        "note": "default monster stat table; fit y = a * level^b, level 1..83",
        "growth_fit": {k: v for k, v in fits.items() if v},
        "samples": samples,
    }


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def build(data_dir: Path):
    mods = read_json(data_dir / "mods.json")
    base_items = read_json(data_dir / "base_items.json")
    gems = read_json(data_dir / "gems.json")
    stats = read_json(data_dir / "stats.json")
    monster = read_json(data_dir / "default_monster_stats.json")

    reps = pick_representatives(base_items)
    families, unmapped, normal = collect_affixes(mods, reps)
    base_sec = base_types_section(base_items, reps)
    scaling = scaling_section(base_items, reps)
    stats_sec = stats_section(stats, families)
    skills = skills_section(gems)
    drops = drops_section(base_items, normal, families, reps)
    drops["monster_stat_scaling"] = monster_scaling_section(monster)

    meta = {
        "schema": SCHEMA_ID,
        "schema_doc": SCHEMA_DOC,
        "source": SOURCE,
        "method": "RePoE JSON -> self-named aggregates; no names, text or art",
        "license": {
            "code": "this script: project-internal",
            "data": "raw exports (c) Grinding Gear Games, not redistributed",
            "repository_content": "derived numeric aggregates only",
        },
        "slot_order": SLOT_ORDER,
        "inputs": {
            name: {"sha256": sha256(data_dir / name)}
            for name in ("mods.json", "base_items.json", "gems.json",
                         "stats.json", "default_monster_stats.json")
        },
    }

    documents = {
        "base-types.json": {
            "meta": meta,
            "aggregation": "one row per item class; representative base = lowest drop level, numeric fields only",
            **base_sec,
            "scaling_fits": scaling,
        },
        "affixes.json": {
            "meta": meta,
            "rules": {
                "family_key": "kind + primary normalized stat + exact eligible slot set",
                "tier_1": "lowest level requirement inside the family",
                "weight_semantics": "ordered spawn_weights: first tag matching the base item's tags wins",
                "slot_weights": "weight of the family tier for that slot; 0/absent means ineligible",
                "exclusivity": "at most one affix per family on an item (PoE mod group rule)",
                "rare_item_budget": {"prefix_max": 3, "suffix_max": 3},
            },
            "families": families,
            "coverage": {
                "normal_affix_mods": len(normal),
                "families": len(families),
                "mapped_stats": len({f["stat"] for f in families}),
                "unmapped_stat_ids": len(unmapped),
                "unmapped_stat_occurrences": sum(unmapped.values()),
            },
        },
        "stats.json": {"meta": meta, **stats_sec},
        "skills.json": {"meta": meta, **skills},
        "drops.json": {"meta": meta, **drops},
    }

    summary = {
        "schema": SCHEMA_ID,
        "source": SOURCE,
        "counts": {
            "item_classes": len(base_sec["classes"]),
            "representative_bases": len(base_sec["representative_bases"]),
            "normal_affix_mods": len(normal),
            "affix_families": len(families),
            "affix_tiers": sum(f["tier_count"] for f in families),
            "affix_prefix_families": sum(1 for f in families if f["kind"] == "prefix"),
            "affix_suffix_families": sum(1 for f in families if f["kind"] == "suffix"),
            "stat_catalog_keys": len(stats_sec["catalog"]),
            "stats_json_ids": stats_sec["aggregation_model"]["evidence"]["stat_ids_total"],
            "gems_total": skills["counts"]["gems_total"],
            "gems_active": skills["counts"]["active"],
            "gems_support": skills["counts"]["support"],
            "gem_tags": len(skills["gem_tags"]),
            "active_skill_types": len(skills["active_types"]),
            "affix_pool_rows": len(drops["affix_pool_by_ilvl"]),
        },
    }
    return documents, summary


def write_documents(out_dir: Path, documents, summary):
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, doc in documents.items():
        path = out_dir / name
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=False) + "\n")
        print(f"wrote {path} ({path.stat().st_size / 1024:.1f} KiB)")
    summary_path = out_dir / "_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {summary_path} ({summary_path.stat().st_size / 1024:.1f} KiB)")


def print_stats(summary):
    print("\n== statistics ==")
    for key, value in summary["counts"].items():
        print(f"{key:32s} {value}")


def check_schema(example_path: Path):
    doc = json.loads(example_path.read_text())
    required = {
        "meta": dict,
        "slots": list,
        "base_type": dict,
        "affix_families": list,
        "stat_catalog": list,
        "aggregation": dict,
        "skill": dict,
        "support": dict,
    }
    missing = [k for k, t in required.items() if not isinstance(doc.get(k), t)]
    if missing:
        print(f"schema example INVALID: missing/mistyped {missing}", file=sys.stderr)
        return 1
    for fam in doc["affix_families"]:
        if not {"id", "kind", "stat", "slots", "tiers"} <= set(fam):
            print(f"schema example INVALID: family {fam.get('id')} lacks keys", file=sys.stderr)
            return 1
        if fam["kind"] not in ("prefix", "suffix"):
            print(f"schema example INVALID: bad kind {fam['kind']}", file=sys.stderr)
            return 1
        for tier in fam["tiers"]:
            if not {"tier", "ilvl", "stats"} <= set(tier):
                print(f"schema example INVALID: tier lacks keys in {fam['id']}", file=sys.stderr)
                return 1
    print(f"schema example OK: {example_path} "
          f"({len(doc['affix_families'])} families, {len(doc['slots'])} slots)")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("/tmp/poe-data/repoe-latest"),
                        help="directory with RePoE JSON exports")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "data")
    parser.add_argument("--check", type=Path, nargs="?", const=Path("schema.example.json"),
                        help="validate a normalized schema example and exit")
    args = parser.parse_args(argv)

    if args.check:
        return check_schema(args.check)

    missing = [f for f in ("mods.json", "base_items.json", "gems.json",
                           "stats.json", "default_monster_stats.json")
               if not (args.data / f).exists()]
    if missing:
        parser.error(f"missing inputs in {args.data}: {missing}; download from "
                     f"https://repoe-fork.github.io/<name>.json")

    documents, summary = build(args.data)
    write_documents(args.out, documents, summary)
    print_stats(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
