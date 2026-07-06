# Engine gap ledger

Burn-down list of engine holes found while dogfooding — see `skills/jgengine-workflow/SKILL.md` for the rules. Entries land here only when a gap was too big to fix in the pass that found it. Ship the primitive → delete the entry in the same change. An entry that survives two subsequent games gets implemented or deleted with a stated reason.

Entry format:

```
## <short-name>
- Found while: <game and system being built>
- Glue it forced: <what had to be hand-rolled, or what was cut>
- Proposed primitive: <module + signature sketch, domain-free>
```

## Open

## shell-object-model-rendering
- Found while: raising the world quality bar (2026-07-05) — GamePlayerShell renders scene objects as `colorFromId` boxes and ignores the game's `assets.ts` render catalog entirely
- Glue it forced: games cannot show buildings/props/containers as real models through the shell; the "world is content" bar in `jgengine-workflow` currently leans on `entitySprites` billboards only
- Proposed primitive: shell resolves `object.catalogId` → asset key via the game's `AssetCatalog` and renders GLB models (drei `useGLTF`, suspense + fallback box), keyed off `GameDefinition.assets`; same path for entities with a `model` asset (sprites stay as the 2D option)

## shell-world-dressing
- Found while: same audit — the shell's ground is a fixed `GroundPlane` + `gridHelper` + hardcoded `RockField`, regardless of the game's `world` feature
- Glue it forced: every game shows the same flat gray arena; `biomes`/`tilemap` descriptors have no visual consequence in the shell
- Proposed primitive: shell consumes the `WorldFeature` descriptor — ground material/texture config (game-supplied), zone-driven prop placement from the game's `world/setup.ts` scene objects, optional skybox/fog params on `PlayableGame` (e.g. `environment: { sky, fog, groundTexture }`)
