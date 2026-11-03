#!/usr/bin/env python3
"""Build and validate p9's authored itemization data.

The tier *shape* is informed by research/poe (five-tier ladders, geometric
growth, strong top-tier rarity); every id, name and number in the output is
p9-authored.  Output is deterministic and safe to re-run.

Usage:
    python3 tools/build_itemization.py            # write p9-itemization.json
    python3 tools/build_itemization.py --check    # validate existing JSON (CI)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import p9_spec as spec

SCHEMA = "p9.itemization/1"
TIER_ILVLS = (1, 10, 20, 32, 45)
TIER_WEIGHTS = (1000, 620, 380, 220, 110)
BLOCKLIST = (
    "path of exile", "poe", "grinding gear", "ggg", "wraeclast",
    "fireball", "brute", "plate vest", "of the bear", "vaal", "tabula",
)


def quantize(unit: str, value: float) -> float:
    if unit == "int":
        return int(round(value))
    if unit == "fraction":
        return round(value, 3)
    return round(value, 1)


def stat_index() -> dict:
    return {row[0]: {
        "id": row[0],
        "unit": row[1],
        "mode": row[2],
        "base": row[3],
        "min": row[4],
        "max": row[5],
        "nameEn": row[6],
        "nameZh": row[7],
    } for row in spec.STATS}


def roll_range(unit: str, t1_min: float, t1_max: float, t5_max: float, tier: int,
               previous_max: float | None):
    """Geometric interpolation from the authored first/last tier endpoints.

    Each tier must be strictly better than the previous one, so the lower bound
    is lifted above the previous tier's maximum.
    """
    ratio = (t5_max / t1_max) ** (tier / (len(TIER_ILVLS) - 1))
    hi = quantize(unit, t1_max * ratio)
    lo = quantize(unit, t1_max * ratio * (t1_min / t1_max))
    if previous_max is not None:
        step = 1 if unit == "int" else (0.005 if unit == "fraction" else 0.1)
        lo = max(lo, quantize(unit, previous_max + step))
        hi = max(hi, lo)
    if unit == "int":
        lo, hi = int(lo), int(hi)
    if hi < lo:
        hi = lo
    return lo, hi


def build_families(stats: dict):
    families = []
    for pool, kinds in spec.POOLS.items():
        for kind in ("prefix", "suffix"):
            for key in kinds[kind]:
                spec_row = spec.AFFIX_SPECS[key]
                weight = spec_row[-3]
                name_en = spec_row[-2]
                name_zh = spec_row[-1]
                first = spec_row[0]
                previous: dict[str, float] = {}
                if isinstance(first, dict):
                    stat_keys = list(first)
                    growth = first
                    tiers = []
                    for tier, ilvl in enumerate(TIER_ILVLS):
                        rolls = []
                        for stat_key, (t1_min, t1_max, t5_max) in growth.items():
                            unit = stats[stat_key]["unit"]
                            lo, hi = roll_range(unit, t1_min, t1_max, t5_max, tier,
                                                previous.get(stat_key))
                            previous[stat_key] = hi
                            rolls.append({
                                "stat": stat_key,
                                "mode": stats[stat_key]["mode"],
                                "min": lo,
                                "max": hi,
                                **({"integer": True} if unit == "int" else {}),
                            })
                        tiers.append({
                            "tier": tier + 1,
                            "ilvl": ilvl,
                            "weight": TIER_WEIGHTS[tier],
                            "rolls": rolls,
                        })
                else:
                    stat_key = first
                    t1_min, t1_max, t5_max = spec_row[1], spec_row[2], spec_row[3]
                    unit = stats[stat_key]["unit"]
                    tiers = []
                    for tier, ilvl in enumerate(TIER_ILVLS):
                        lo, hi = roll_range(unit, t1_min, t1_max, t5_max, tier,
                                            previous.get(stat_key))
                        previous[stat_key] = hi
                        tiers.append({
                            "tier": tier + 1,
                            "ilvl": ilvl,
                            "weight": TIER_WEIGHTS[tier],
                            "rolls": [{
                                "stat": stat_key,
                                "mode": stats[stat_key]["mode"],
                                "min": lo,
                                "max": hi,
                                **({"integer": True} if unit == "int" else {}),
                            }],
                        })
                    stat_keys = [stat_key]

                families.append({
                    "id": f"{pool}.{kind}.{key}",
                    "kind": kind,
                    "pool": pool,
                    "stat": stat_keys[0],
                    "stats": stat_keys,
                    "nameEn": name_en,
                    "nameZh": name_zh,
                    "weight": weight,
                    "exclusiveGroup": f"{pool}.{kind}.{key}",
                    "tiers": tiers,
                })
    return families


def build_drop_tables():
    tables = []
    for low, high, ilvl in spec.ILVL_BANDS:
        for tier in ("normal", "elite", "boss"):
            weights = spec.SOURCE_RARITY_WEIGHTS[tier]
            tables.append({
                "id": f"drop.{tier}.{low}-{high}",
                "enemyTier": tier,
                "ilvlBand": [low, high],
                "ilvl": ilvl,
                "rarityWeights": {rid: weights[rid] for rid in
                                  ("common", "magic", "rare", "legendary")},
                "slotWeights": dict(spec.SLOT_WEIGHTS),
            })
    return tables


def rarity_docs():
    out = []
    for rid, en, zh, weight, pmin, pmax, smin, smax in spec.RARITIES:
        out.append({
            "id": rid,
            "nameEn": en,
            "nameZh": zh,
            "weight": weight,
            "minAffixes": pmin + smin,
            "maxAffixes": pmax + smax,
            "prefixMin": pmin,
            "prefixMax": pmax,
            "suffixMin": smin,
            "suffixMax": smax,
        })
    return out


def first_ten_minutes(rarities):
    kills = spec.FIRST_TEN_MINUTES["assumedKills"]
    chance = spec.FIRST_TEN_MINUTES["itemDropsPerKill"]
    totals = {r["id"]: 0.0 for r in rarities}
    drops = 0.0
    per_source = []
    for tier in ("normal", "elite", "boss"):
        count = kills[tier] * chance[tier]
        drops += count
        weights = spec.SOURCE_RARITY_WEIGHTS[tier]
        total = sum(weights.values())
        row = {"enemyTier": tier, "itemDrops": round(count, 1)}
        for rarity in rarities:
            value = count * weights[rarity["id"]] / total
            totals[rarity["id"]] += value
            row[rarity["id"]] = round(value, 2)
        per_source.append(row)
    return {
        "assumed": {
            "kills": dict(kills),
            "itemDropsPerKill": dict(chance),
        },
        "itemDrops": round(drops, 1),
        "byRarity": {k: round(v, 2) for k, v in totals.items()},
        "bySource": per_source,
    }


def kit_loot_view(doc):
    rarities = [{k: r[k] for k in ("id", "weight", "minAffixes", "maxAffixes")}
                for r in doc["rarities"]]
    sample_pool = "armor"
    affixes = []
    for family in doc["affixFamilies"]:
        if family["pool"] != sample_pool:
            continue
        for tier in family["tiers"]:
            if tier["ilvl"] > 40:
                continue
            affixes.append({
                "id": f"{family['id']}@{tier['tier']}",
                "weight": round(family["weight"] * tier["weight"] / 1000, 2),
                "rarities": {"magic": 1, "rare": 1, "legendary": 1},
                "rolls": tier["rolls"],
            })
    return {
        "note": ("Shape-compatible with @lunego/kit-loot. Build one LootTable per "
                 "(slot, kind, ilvl): pick rarity from dropTables.rarityWeights, then "
                 "pick family by weight, then tier by tier.weight, then call "
                 "rollLoot on a single-affix table built from this tier.rolls."),
        "rarities": rarities,
        "examplePool": sample_pool,
        "exampleAffixes": affixes[:8],
        "poolAffixDefinitions": sum(1 for f in doc["affixFamilies"] for t in f["tiers"]
                                      if f["pool"] == sample_pool),
    }


def build_document():
    stats = stat_index()
    families = build_families(stats)
    rarities = rarity_docs()
    bases = []
    for bid, pool, drop_level, en, zh, base_stats in spec.BASE_TYPES:
        bases.append({
            "id": bid,
            "pool": pool,
            "dropLevel": drop_level,
            "nameEn": en,
            "nameZh": zh,
            "bases": base_stats,
            "weight": 100,
        })

    doc = {
        "meta": {
            "schema": SCHEMA,
            "generatedBy": "tools/build_itemization.py",
            "provenance": {
                "structure": "research/poe (tier ladder shape, weight-shaped rarity)",
                "content": "authored for p9; no PoE names, text or verbatim values",
                "reference": "research/poe/DESIGN-NOTES.md",
            },
            "units": {
                "fraction": "0.05 == 5%; p9 formula is (1 + value)",
                "int": "whole point values",
                "li": "ilvl gate = minimum source item level",
            },
            "tierIlvls": list(TIER_ILVLS),
            "tierWeights": list(TIER_WEIGHTS),
            "slotPool": {s[0]: s[1] for s in spec.SLOTS},
        },
        "stats": list(stats.values()),
        "slots": [
            {"id": sid, "pool": pool, "nameEn": en, "nameZh": zh}
            for sid, pool, en, zh in spec.SLOTS
        ],
        "baseTypes": bases,
        "affixFamilies": families,
        "rarities": rarities,
        "dropTables": build_drop_tables(),
        "firstTenMinutes": first_ten_minutes(rarities),
    }
    doc["kitLoot"] = kit_loot_view(doc)
    doc["meta"]["counts"] = {
        "slots": len(doc["slots"]),
        "pools": len(spec.POOLS),
        "baseTypes": len(bases),
        "stats": len(stats),
        "affixFamilies": len(families),
        "affixTiers": sum(len(f["tiers"]) for f in families),
        "rolls": sum(len(t["rolls"]) for f in families for t in f["tiers"]),
        "rarities": len(rarities),
        "dropTables": len(doc["dropTables"]),
    }
    return doc, stats


def fail(message: str, errors: list):
    errors.append(message)


def validate(doc, stats):
    errors: list[str] = []

    # stats
    for stat in doc["stats"]:
        if stat["unit"] not in ("int", "fraction", "float"):
            fail(f"stat {stat['id']}: bad unit", errors)
        if stat["mode"] not in ("add", "mul"):
            fail(f"stat {stat['id']}: bad mode", errors)
        if not (stat["min"] <= stat["base"] <= stat["max"]):
            fail(f"stat {stat['id']}: base outside min/max", errors)

    # slots and per-slot pool size
    slot_ids = [s["id"] for s in doc["slots"]]
    if len(slot_ids) != 9:
        fail(f"expected 9 slots, got {len(slot_ids)}", errors)
    if len(set(slot_ids)) != len(slot_ids):
        fail("duplicate slot ids", errors)
    for slot in doc["slots"]:
        if slot["pool"] not in spec.POOLS:
            fail(f"slot {slot['id']}: unknown pool {slot['pool']}", errors)

    for pool in spec.POOLS:
        for kind in ("prefix", "suffix"):
            count = sum(1 for f in doc["affixFamilies"]
                        if f["pool"] == pool and f["kind"] == kind)
            if not 6 <= count <= 10:
                fail(f"pool {pool} {kind}: {count} families, expected 6-10", errors)

    # affixes: tiers, monotonicity, stat keys, weights, names
    seen_ids = set()
    for family in doc["affixFamilies"]:
        if family["id"] in seen_ids:
            fail(f"duplicate family id {family['id']}", errors)
        seen_ids.add(family["id"])
        if family["kind"] not in ("prefix", "suffix"):
            fail(f"{family['id']}: bad kind", errors)
        if not family["nameEn"] or not family["nameZh"]:
            fail(f"{family['id']}: missing name", errors)
        text = f"{family['nameEn']} {family['nameZh']}".lower()
        for word in BLOCKLIST:
            if word in text:
                fail(f"{family['id']}: blocked word {word!r}", errors)
        if len(family["tiers"]) < 4 or len(family["tiers"]) > 6:
            fail(f"{family['id']}: {len(family['tiers'])} tiers, expected 4-6", errors)
        if family["weight"] <= 0:
            fail(f"{family['id']}: weight must be positive", errors)
        previous_ilvl = -1
        previous_max: dict[str, float] = {}
        for tier in family["tiers"]:
            if tier["ilvl"] <= previous_ilvl:
                fail(f"{family['id']} t{tier['tier']}: ilvl not strictly increasing", errors)
            previous_ilvl = tier["ilvl"]
            if tier["weight"] <= 0:
                fail(f"{family['id']} t{tier['tier']}: weight must be positive", errors)
            for roll in tier["rolls"]:
                if roll["stat"] not in stats:
                    fail(f"{family['id']}: unknown stat {roll['stat']}", errors)
                    continue
                stat = stats[roll["stat"]]
                if roll["mode"] != stat["mode"]:
                    fail(f"{family['id']}: mode mismatch for {roll['stat']}", errors)
                if stat["unit"] == "int" and not roll.get("integer"):
                    fail(f"{family['id']}: int stat {roll['stat']} must set integer", errors)
                if stat["unit"] != "int" and roll.get("integer"):
                    fail(f"{family['id']}: non-int stat {roll['stat']} sets integer", errors)
                if roll["min"] > roll["max"]:
                    fail(f"{family['id']}: roll min>max for {roll['stat']}", errors)
                if roll["min"] < stat["min"] or roll["max"] > stat["max"]:
                    fail(f"{family['id']}: roll outside stat bounds for {roll['stat']}", errors)
                if roll["stat"] in previous_max:
                    if roll["max"] <= previous_max[roll["stat"]]:
                        fail(f"{family['id']}: tier max does not increase for {roll['stat']}", errors)
                    elif roll["min"] <= previous_max[roll["stat"]]:
                        fail(f"{family['id']}: tiers overlap for {roll['stat']}", errors)
                previous_max[roll["stat"]] = roll["max"]

    # rarities
    rarity_ids = [r["id"] for r in doc["rarities"]]
    if rarity_ids != ["common", "magic", "rare", "legendary"]:
        fail(f"unexpected rarities {rarity_ids}", errors)
    for rarity in doc["rarities"]:
        if rarity["minAffixes"] != rarity["prefixMin"] + rarity["suffixMin"]:
            fail(f"rarity {rarity['id']}: minAffixes mismatch", errors)
        if rarity["maxAffixes"] != rarity["prefixMax"] + rarity["suffixMax"]:
            fail(f"rarity {rarity['id']}: maxAffixes mismatch", errors)
        if rarity["weight"] <= 0:
            fail(f"rarity {rarity['id']}: weight must be positive", errors)

    # bases
    for base in doc["baseTypes"]:
        if base["pool"] not in spec.POOLS:
            fail(f"base {base['id']}: unknown pool", errors)
        for key, value in base["bases"].items():
            if key not in stats:
                fail(f"base {base['id']}: unknown stat {key}", errors)
            elif not (stats[key]["min"] <= value <= stats[key]["max"]):
                fail(f"base {base['id']}: {key} outside stat bounds", errors)
        if not 1 <= base["dropLevel"] <= 60:
            fail(f"base {base['id']}: dropLevel out of range", errors)

    # drop tables
    if len(doc["dropTables"]) != len(spec.ILVL_BANDS) * 3:
        fail("dropTables must cover every band and enemy tier", errors)
    for table in doc["dropTables"]:
        if abs(sum(table["slotWeights"].values()) - 100) > 1e-6:
            fail(f"{table['id']}: slot weights must sum to 100", errors)
        if set(table["slotWeights"]) != set(spec.POOLS):
            fail(f"{table['id']}: slot weights must cover every pool", errors)
        if not all(w >= 0 for w in table["rarityWeights"].values()):
            fail(f"{table['id']}: negative rarity weight", errors)
        if sum(table["rarityWeights"].values()) <= 0:
            fail(f"{table['id']}: rarity weights must have a positive total", errors)
        if table["rarityWeights"].get("common", 0) + table["rarityWeights"].get("magic", 0) \
                + table["rarityWeights"].get("rare", 0) + table["rarityWeights"].get("legendary", 0) <= 0:
            fail(f"{table['id']}: empty rarity table", errors)
        low, high = table["ilvlBand"]
        if not low <= table["ilvl"] <= high:
            fail(f"{table['id']}: ilvl outside band", errors)

    # kit view
    for rarity in doc["kitLoot"]["rarities"]:
        if set(rarity) != {"id", "weight", "minAffixes", "maxAffixes"}:
            fail("kitLoot rarity must match RarityDefinition shape", errors)
    for affix in doc["kitLoot"]["exampleAffixes"]:
        if set(affix) != {"id", "weight", "rarities", "rolls"}:
            fail(f"kitLoot affix {affix['id']}: must match AffixDefinition shape", errors)
        for roll in affix["rolls"]:
            if set(roll) - {"stat", "mode", "min", "max", "integer"}:
                fail(f"kitLoot affix {affix['id']}: unknown roll field", errors)

    return errors


def print_stats(doc):
    counts = doc["meta"]["counts"]
    print("== p9 itemization ==")
    for key, value in counts.items():
        print(f"{key:16s} {value}")
    print("\nper pool (prefix/suffix):")
    for pool in spec.POOLS:
        p = sum(1 for f in doc["affixFamilies"] if f["pool"] == pool and f["kind"] == "prefix")
        s = sum(1 for f in doc["affixFamilies"] if f["pool"] == pool and f["kind"] == "suffix")
        print(f"  {pool:10s} {p}/{s}")
    print("\ntop-tier chance per family (eligible tier 5):")
    weights = [t["weight"] for t in doc["affixFamilies"][0]["tiers"]]
    print(f"  {weights[4] / sum(weights):.1%} (weights {weights})")
    ten = doc["firstTenMinutes"]
    print(f"\nfirst 10 min: {ten['itemDrops']} items, by rarity {ten['byRarity']}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path,
                        default=Path(__file__).resolve().parent.parent / "p9-itemization.json")
    parser.add_argument("--check", nargs="?", const="__self__", default=None,
                        help="validate the output file (or a path) and exit")
    args = parser.parse_args(argv)

    doc, stats = build_document()
    errors = validate(doc, stats)
    if errors:
        for error in errors:
            print(f"INVALID: {error}", file=sys.stderr)
        return 1

    if args.check is not None:
        path = args.out if args.check == "__self__" else Path(args.check)
        if not path.exists():
            print(f"missing {path}", file=sys.stderr)
            return 1
        existing = json.loads(path.read_text())
        existing_errors = validate(existing, stat_index())
        if existing_errors:
            for error in existing_errors:
                print(f"INVALID: {error}", file=sys.stderr)
            return 1
        if existing != doc:
            print(f"{path} is stale; re-run without --check", file=sys.stderr)
            return 1
        print(f"OK {path} ({path.stat().st_size / 1024:.1f} KiB)")
        return 0

    args.out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.1f} KiB)")
    print_stats(doc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
