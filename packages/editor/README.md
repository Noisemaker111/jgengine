# @jgengine/editor

Browser-based 3D scene editor for [JGengine](https://github.com/Noisemaker111/jgengine) — author `editor.scene.json` (placement, terrain, paths, zones, foliage, triggers, catalogs) through a Blender/Unity-style GUI or the agent RPC bridge.

Usually reached through the CLI rather than imported directly:

```sh
npx jgengine editor            # open the editor on the current folder
npx jgengine editor ./world --assets ./models
```

Inside a scaffolded game the editor is engine-summoned (`?mode=editor`, F2+E); the game consumes the authored document at runtime via `@jgengine/core` / `@jgengine/shell`. Agents drive it headlessly with `npx jgengine editor-mcp` (document RPC over localhost).
