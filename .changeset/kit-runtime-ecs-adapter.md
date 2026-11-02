---
"@lunego/core": patch
"@lunego/kit-runtime": minor
"@lunego/kit-zone": minor
---

Generic ECS runtime adapter closure: `kit-runtime` uses `RuntimeContent`
throughout, per-value deterministic catalog hashes with function/closure
rejection, controllable-only movement, player/explicit attack sources,
drop-before-pickup quest ordering, idempotent encounter starts restored from
`EncounterStateModel`, zone/portal-validated travel, validated snapshot
parsing, typed component registration, and team/perception/line-of-sight AI
targeting with memory. `kit-zone` stores `encounterId` as a content id instead
of embedding encounter data; core exposes the existing `hashValues` helper.
