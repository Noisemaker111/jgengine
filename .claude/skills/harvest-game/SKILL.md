---
name: harvest-game
description: Build a probe or full game while recording reusable engine gaps.
---

# Harvest a game

Choose `scope: probe` for a minimal playable slice or `scope: full` for the complete requested game. Scope changes breadth, not quality or workflow.

## Target

Resolve a named game, genre, or linked source into mechanics, camera, controls, content, HUD, and an observable completion scenario. Sources specify behavior and data, never implementation: rebuild on JGengine seams and copy assets only when their license permits it.

## Build

1. Use `jgengine` for intake and load only selected domains.
2. Scaffold with `bun run new:game <id> --name "Title"`; never copy another game harness.
3. For `probe`, implement the smallest polished loop that stresses the target seam.
4. For `full`, implement every requested system end to end and enough content to exercise scale.
5. Author world content through `jgengine-editor`; consume it through shared runtime primitives.

Track gaps while building as `blocker`, `workaround`, or `ergonomics`. A gap is a missing reusable seam, wrong default, or avoidable integration burden—not simply game-specific work. Prefer evidence from an attempted engine path over speculation.

## Finish

Verify the observable scenario through `jgengine-verify`. File substantial reusable gaps as concise `[FEATURE]` issues with problem, context, and primitive-level scope. Small in-scope fixes may land with the game when they share its verification story.

Ship the game and coherent upstream fixes through `workflow`. Report the delivered scope, evidence, and filed gap links.

