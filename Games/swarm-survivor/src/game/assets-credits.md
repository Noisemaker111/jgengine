# Asset credits

The build sandbox this game was authored in blocks outbound HTTPS to every
CC0 source named in `jgengine-assets` (kenney.nl, itch.io, quaternius.com,
poly.pizza, polyhaven.com, ambientcg.com, opengameart.org, cdn.jsdelivr.net
all return a proxy 403 — confirmed by direct `curl` attempts, not assumed),
so `@jgengine/assets`'s `pull` step cannot fetch any pack.

Every entity billboard in `src/game/assets.ts` (`outrider`, `skitterling`,
`husk`, `bloatling`, `warden`) and the XP gem icon are original, hand-authored
inline SVG silhouettes — no third-party art, no license to credit. They
stand in for a real Kenney/Quaternius/KayKit character pack; swap
`entitySprites`/`entityModels` for pulled GLBs the moment this game is
built somewhere with CDN access, per `jgengine-assets`.

The environment (terrain, grass, rain, ruined structures) is entirely
procedural via `@jgengine/core/world/features` — no asset dependency.
