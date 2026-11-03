#!/usr/bin/env python3
"""Build and validate p9's authored class / skill / passive data.

Uses tools/p9_classes_spec.py for content and p9-itemization.json for the stat
catalogue, so passives always reference real stat ids.  Deterministic output.

Usage:
    python3 tools/build_classes.py            # write p9-classes.json
    python3 tools/build_classes.py --check    # validate existing JSON (CI)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import p9_classes_spec as spec

SCHEMA = "p9.classes/1"
BLOCKLIST = (
    "path of exile", "poe", "grinding gear", "ggg", "wraeclast",
    "fireball", "brute", "vaal", "tabula", "warcry", "cyclone",
)
ROOT = Path(__file__).resolve().parent.parent
BASE_KEYS = {"health", "mana", "armorFlat", "energyShieldFlat",
             "movementSpeed", "critPct", "critMultiplier"}


def blocked(text: str) -> str | None:
    lowered = text.lower()
    for word in BLOCKLIST:
        if re.search(rf"\b{re.escape(word)}\b", lowered):
            return word
    return None


def stat_catalogue():
    path = ROOT / "p9-itemization.json"
    if not path.exists():
        raise SystemExit(f"missing {path}; run tools/build_itemization.py first")
    doc = json.loads(path.read_text())
    return {stat["id"]: stat for stat in doc["stats"]}


def level_rows(skill_id):
    rows = []
    for level, damage, extra in spec.SKILL_LEVELS[skill_id]:
        rows.append({"level": level, "damage": damage, **extra})
    return rows


def build_skills(class_id):
    out = []
    for key, en, zh, resource, cost, cooldown, target, tags, mechanic in spec.SKILLS[class_id]:
        skill_id = f"{class_id}.{key}"
        out.append({
            "id": skill_id,
            "key": key,
            "classId": class_id,
            "nameEn": en,
            "nameZh": zh,
            "costs": [{"resource": resource, "amount": cost}],
            "cooldownTicks": cooldown,
            "target": target,
            "tags": tags,
            "mechanic": mechanic,
            "levels": level_rows(skill_id),
        })
    return out


def build_passives(class_id, rows):
    out = []
    by_tier: dict[int, int] = {}
    for key, tier, en, zh, parents, effects in rows:
        col = by_tier.get(tier, 0)
        by_tier[tier] = col + 1
        out.append({
            "id": f"{class_id}.{key}",
            "key": key,
            "classId": class_id,
            "tier": tier,
            "nameEn": en,
            "nameZh": zh,
            "position": {"row": tier - 1, "col": col},
            "requires": [f"{class_id}.{parent}" for parent in parents],
            "effects": [
                {"kind": "stat", "stat": e[1], "mode": e[2], "value": e[3]}
                if e[0] == "stat" else {"kind": "flag", "flag": e[1], "value": e[2]}
                for e in effects
            ],
        })
    return out


def build_progression():
    cfg = spec.PROGRESSION
    milestones = {m["level"]: m["points"] for m in cfg["milestoneBonus"]}
    levels = []
    cumulative = 0
    for level in range(1, cfg["maxLevel"] + 1):
        xp_to_next = cfg["xpFormula"]["base"] + cfg["xpFormula"]["perLevel"] * level
        points = (level - 1) * cfg["pointsPerLevel"] + sum(
            bonus for lvl, bonus in milestones.items() if lvl <= level)
        levels.append({
            "level": level,
            "xpToNext": xp_to_next,
            "cumulativeXp": cumulative,
            "skillPoints": points,
            "estimatedNormalKills": round(cumulative / 5),
        })
        cumulative += xp_to_next
    return {
        "maxLevel": cfg["maxLevel"],
        "xpFormula": cfg["xpFormula"],
        "pointsPerLevel": cfg["pointsPerLevel"],
        "milestoneBonus": cfg["milestoneBonus"],
        "levels": levels,
        "totalXpToMax": levels[-1]["cumulativeXp"],
        "skillPointsAtMax": levels[-1]["skillPoints"],
    }


def build_document():
    stats = stat_catalogue()
    classes = []
    for cls in spec.CLASSES:
        cid = cls["id"]
        skills = build_skills(cid)
        passive_rows = spec.KNIGHT_PASSIVES if cid == "knight" else spec.MAGE_PASSIVES
        passives = build_passives(cid, passive_rows)
        classes.append({
            "id": cid,
            "nameEn": cls["nameEn"],
            "nameZh": cls["nameZh"],
            "archetype": cls["archetype"],
            "sprite": cls["sprite"],
            "base": cls["base"],
            "resources": cls["resources"],
            "primaryResource": cls["primaryResource"],
            "secondaryResource": cls["secondaryResource"],
            "skills": skills,
            "passives": passives,
        })

    doc = {
        "meta": {
            "schema": SCHEMA,
            "generatedBy": "tools/build_classes.py",
            "provenance": {
                "structure": "kit-ability AbilityDefinition/TargetSpec + p9 stat catalogue",
                "content": "authored for p9; no PoE names, text or verbatim values",
                "reference": "research/poe/DESIGN-NOTES.md, p9-itemization.md",
            },
            "notes": {
                "ticks": "cooldowns are whole ticks, matching kit-ability and p9 combat",
                "percent": "fraction stats (0.05 == 5%) so p9's (1 + value) formulas hold",
                "rage": "designed secondary resource for knight; p9 currently tracks mana only",
                "flags": "flag effects are game-side counters; stat effects map to StatBlock",
            },
            "counts": {
                "classes": len(classes),
                "skills": sum(len(c["skills"]) for c in classes),
                "passives": sum(len(c["passives"]) for c in classes),
                "maxSkillLevel": len(spec.SKILL_LEVELS["knight.cleave"]),
            },
        },
        "resources": list(spec.RESOURCES.values()),
        "classes": classes,
        "progression": build_progression(),
    }
    doc["kitView"] = {
        "abilities": [
            {
                "id": skill["id"],
                "cooldownTicks": skill["cooldownTicks"],
                "costs": skill["costs"],
                "target": skill["target"],
            }
            for cls in classes for skill in cls["skills"]
        ],
        "passiveModifierExample": {
            "affix": "knight.iron_body",
            "modifiers": [
                {"stat": "healthBonus", "mode": "add", "value": 15, "source": "knight.iron_body"}
            ],
        },
        "note": ("AbilityDefinition = kitView.abilities[i]. Passive stats feed "
                 "StatBlock.add; flags are read by the game, not by kit-stats. "
                 "TargetSpec kinds are none/point/direction/nearest."),
    }
    doc["meta"]["counts"]["statDefinitionsReferenced"] = len({
        e["stat"] for cls in classes for node in cls["passives"] for e in node["effects"]
        if e["kind"] == "stat"
    })
    return doc, stats


def validate(doc, stats):
    errors: list[str] = []
    seen: set[str] = set()

    if len(doc["classes"]) != 2:
        errors.append(f"expected 2 classes, got {len(doc['classes'])}")
    if doc["progression"]["maxLevel"] != 20:
        errors.append("maxLevel must be 20 to match p9's curve")

    for cls in doc["classes"]:
        cid = cls["id"]
        if len(cls["skills"]) != 5:
            errors.append(f"{cid}: expected 5 skills, got {len(cls['skills'])}")
        if not 30 <= len(cls["passives"]) <= 50:
            errors.append(f"{cid}: expected 30-50 passives, got {len(cls['passives'])}")
        for key, value in cls["base"].items():
            if key not in BASE_KEYS:
                errors.append(f"{cid}: unknown base stat {key}")
            if not isinstance(value, (int, float)) or value <= 0:
                errors.append(f"{cid}: base {key} must be positive")

        skill_keys = set()
        for skill in cls["skills"]:
            if skill["id"] in seen:
                errors.append(f"duplicate id {skill['id']}")
            seen.add(skill["id"])
            skill_keys.add(skill["key"])
            if skill["id"] != f"{cid}.{skill['key']}":
                errors.append(f"{skill['id']}: id/key mismatch")
            for text in (skill["nameEn"], skill["nameZh"]):
                hit = blocked(text)
                if hit:
                    errors.append(f"{skill['id']}: blocked name {text!r} ({hit})")
            if not isinstance(skill["cooldownTicks"], int) or skill["cooldownTicks"] <= 0:
                errors.append(f"{skill['id']}: cooldown must be a positive integer")
            if not skill["costs"]:
                errors.append(f"{skill['id']}: needs at least one cost")
            for cost in skill["costs"]:
                if cost["resource"] not in spec.RESOURCES:
                    errors.append(f"{skill['id']}: unknown resource {cost['resource']}")
                if cost["amount"] <= 0:
                    errors.append(f"{skill['id']}: cost must be positive")
            target = skill["target"]
            if target["kind"] not in ("none", "point", "direction", "nearest"):
                errors.append(f"{skill['id']}: bad target kind")
            if target["kind"] != "none":
                if not target.get("range", 0) > 0:
                    errors.append(f"{skill['id']}: target needs range")
            if "minDot" in target:
                if target["kind"] != "direction":
                    errors.append(f"{skill['id']}: minDot only valid for direction")
                if not -1 <= target["minDot"] <= 1:
                    errors.append(f"{skill['id']}: minDot out of range")
            for tag in skill["tags"]:
                if tag not in spec.ALLOWED_TAGS:
                    errors.append(f"{skill['id']}: unknown tag {tag}")

            levels = skill["levels"]
            if [row["level"] for row in levels] != list(range(1, 11)):
                errors.append(f"{skill['id']}: levels must be 1..10")
            previous_damage = -1
            previous_extra: dict[str, float] = {}
            for row in levels:
                if row["damage"] < previous_damage:
                    errors.append(f"{skill['id']}: damage decreases at level {row['level']}")
                if row["damage"] < 0:
                    errors.append(f"{skill['id']}: negative damage")
                previous_damage = row["damage"]
                for key, value in row.items():
                    if key in ("level", "damage"):
                        continue
                    if not isinstance(value, (int, float)):
                        errors.append(f"{skill['id']}: extra {key} must be numeric")
                        continue
                    if value < 0:
                        errors.append(f"{skill['id']}: extra {key} negative")
                    if key in previous_extra and value < previous_extra[key]:
                        errors.append(f"{skill['id']}: extra {key} decreases")
                    previous_extra[key] = value

        node_ids = {node["id"] for node in cls["passives"]}
        by_id = {node["id"]: node for node in cls["passives"]}
        if len(node_ids) != len(cls["passives"]):
            errors.append(f"{cid}: duplicate passive ids")
        for node in cls["passives"]:
            if node["id"] in seen:
                errors.append(f"duplicate id {node['id']}")
            seen.add(node["id"])
            for text in (node["nameEn"], node["nameZh"]):
                hit = blocked(text)
                if hit:
                    errors.append(f"{node['id']}: blocked name {text!r} ({hit})")
            for parent in node["requires"]:
                if parent not in node_ids:
                    errors.append(f"{node['id']}: unknown parent {parent}")
                elif by_id[parent]["tier"] >= node["tier"]:
                    errors.append(f"{node['id']}: parent {parent} must be a lower tier")
            if node["tier"] < 1:
                errors.append(f"{node['id']}: tier must be >= 1")
            if not node["effects"]:
                errors.append(f"{node['id']}: needs at least one effect")
            for effect in node["effects"]:
                if effect["kind"] == "stat":
                    if effect["stat"] not in stats:
                        errors.append(f"{node['id']}: unknown stat {effect['stat']}")
                    elif effect["mode"] not in ("add", "mul"):
                        errors.append(f"{node['id']}: bad mode")
                    elif not isinstance(effect["value"], (int, float)):
                        errors.append(f"{node['id']}: stat value must be numeric")
                elif effect["kind"] == "flag":
                    scope = effect["flag"].split(".")[0]
                    if scope not in skill_keys and scope not in ("rage", "mana"):
                        errors.append(f"{node['id']}: flag scope {scope} is not a skill key")
                    if not effect["flag"].count(".") == 1:
                        errors.append(f"{node['id']}: flag must be <scope>.<name>")
                    if not isinstance(effect["value"], (int, float)):
                        errors.append(f"{node['id']}: flag value must be numeric")
                else:
                    errors.append(f"{node['id']}: unknown effect kind")

    # progression math
    levels = doc["progression"]["levels"]
    if levels[0]["cumulativeXp"] != 0 or levels[0]["skillPoints"] != 0:
        errors.append("level 1 must start at 0 xp / 0 points")
    cumulative = 0
    for row in levels:
        expected_xp = 8 + 6 * row["level"]
        if row["xpToNext"] != expected_xp:
            errors.append(f"level {row['level']}: xpToNext mismatch")
        if row["cumulativeXp"] != cumulative:
            errors.append(f"level {row['level']}: cumulativeXp mismatch")
        cumulative += expected_xp
    if levels[-1]["cumulativeXp"] != doc["progression"]["totalXpToMax"]:
        errors.append("totalXpToMax mismatch")
    if doc["progression"]["skillPointsAtMax"] != levels[-1]["skillPoints"]:
        errors.append("skillPointsAtMax mismatch")

    # kit view shape
    for ability in doc["kitView"]["abilities"]:
        if set(ability) != {"id", "cooldownTicks", "costs", "target"}:
            errors.append(f"kitView ability {ability['id']}: not AbilityDefinition shape")
        for cost in ability["costs"]:
            if set(cost) != {"resource", "amount"}:
                errors.append(f"kitView ability {ability['id']}: bad cost shape")
    return errors


def print_stats(doc):
    counts = doc["meta"]["counts"]
    print("== p9 classes ==")
    for key, value in counts.items():
        print(f"{key:26s} {value}")
    for cls in doc["classes"]:
        print(f"\n{cls['id']}: {len(cls['skills'])} skills / {len(cls['passives'])} passives")
        for skill in cls["skills"]:
            first, last = skill["levels"][0], skill["levels"][-1]
            extra = {k: v for k, v in last.items() if k not in ("level", "damage")}
            print(f"  {skill['key']:12s} dmg {first['damage']:>3}->{last['damage']:<3} "
                  f"cd {skill['cooldownTicks']:<3} {skill['target']['kind']:9s} {extra or ''}")
    prog = doc["progression"]
    print(f"\nlevel 20: {prog['totalXpToMax']} xp, {prog['skillPointsAtMax']} points, "
          f"tree nodes {sum(len(c['passives']) for c in doc['classes'])}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "p9-classes.json")
    parser.add_argument("--check", nargs="?", const="__self__", default=None)
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
        existing_errors = validate(existing, stat_catalogue())
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
