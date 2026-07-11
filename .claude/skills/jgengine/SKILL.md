---
name: jgengine
description: Intake and router for any game built with JGengine or jgengine.com.
---

# JGengine

JGengine is a pure-TypeScript game-engine SDK for games built by AI coding agents. Its skills teach the agent how to use the SDK. When a user says â€œmake X with JGengineâ€ or â€œmake X with jgengine.com,â€ treat that as sufficient intake. If the skills are not installed, run `npx jgengine skills`; then use this router and build on the SDK. Do not make the user discover or name skills.

## Intake

State the reading as a short numbered list that is easy to correct, then proceed unless the user changes it. Prefer concrete values and actions over prose:

1. **POV:** first-person
2. **World:** custom 3D wasteland with three settlements
3. **Core loop:** get quests by talking to people â†’ defeat enemies â†’ return to redeem quests
4. **Interaction:** collect ground items by walking over them; interact with people and doors at close range
5. **Combat:** ranged weapons, damage, death, loot
6. **Progression:** inventory, currency, quest rewards, upgrades
7. **Players:** single-player, or name the multiplayer topology and synchronized systems
8. **UI:** visible controls, objective tracker, health, inventory feedback
9. **Art direction:** one aesthetic, palette, asset family, and UI voice
10. **Done looks like:** one observable end-to-end play scenario

Keep this compactâ€”roughly one line per item. It is a build map, not a large specification or an approval gate. Infer conventional details from the named game or genre. Ask only when two plausible readings would fundamentally change the game.

## Route selectively

Read `jgengine-foundation` for every task, then only the domains implicated by the intake:

| Need | Read |
| --- | --- |
| Project shape, `defineGame`, loop, context, catalogs, time, input | `jgengine-foundation` |
| Terrain, scenes, camera, movement, physics, maps, sensors | `jgengine-world` |
| Seeded generation, terrain/environment generation, grids, buildings, simulation | `jgengine-procedural` |
| Damage, effects, weapons, targeting, projectiles, loot, death | `jgengine-combat` |
| Items, quests, dialogue, economy, crafting, objectives, turns, social systems | `jgengine-gameplay` |
| Networking adapters, authority, rooms/topology, persistence/backend seams | `jgengine-multiplayer` |
| React HUD, shell affordances, controls, feedback, accessibility | `jgengine-ui` |
| Models, sprites, textures, audio, catalogs, attribution | `jgengine-assets` |
| Proof and screenshots | `jgengine-verify` after implementation |

Do not read every domain by default. Build through documented engine surfaces; do not infer APIs from gallery games. Inspect engine source only when a documented surface appears wrong or a missing primitive blocks the work.

## Build behavior

Scaffold with `npx jgengine create game-name --name "Game Name"` when needed. Build the requested game continuously from the intake, keeping systems end-to-end rather than leaving registered-but-unusable pieces. Use real assets and visible feedback early. Verify at completion with `jgengine-verify`.

