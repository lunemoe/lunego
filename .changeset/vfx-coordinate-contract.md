---
"@lunego/vfx": patch
---

Clarify and fix the effect coordinate contract: request positions are world
coordinates (feet anchor by default), composition produces viewport pixels with
camera/zoom, Pixi effect sprites use the inverse world transform, and requests
can offset to the body center before ground projection. Cue consumption now
accepts a rewound host tick after loading an older snapshot.
