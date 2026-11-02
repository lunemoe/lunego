---
"@lunego/host": minor
"@lunego/core": patch
---

Local profile/meta systems: `ProfileStore` accounts/character slots with
snapshot validation, corruption diagnostics, selection and account bundle
export/import; paired `Game.saveGame()`/`loadGame()` using
`World.fromSnapshots` with atomic failure recovery; tick-derived
`WorldClock`/`SeasonClock` daily/weekly/season boundaries; deterministic
`LocalLeaderboard` with profile-scoped persistence. Core additionally exports
the existing `mergeSnapshots` helper so paired loads keep replay snapshots
combined.
