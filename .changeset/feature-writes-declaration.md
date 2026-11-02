---
"@lunego/core": minor
---

Feature-level write declarations.

- `defineFeature` accepts `writes: readonly StateDef[]`, normalized onto
  `FeatureDef.writes`.
- `WorldCatalog` builds a per-catalog `featureWrites` map after schema
  registration; entries must point at already registered states, otherwise
  registration fails. `validateWriters` folds these into `allowedWriters`, so a
  feature can write another feature's component/model without mutating the
  state's `writers` option at runtime.
