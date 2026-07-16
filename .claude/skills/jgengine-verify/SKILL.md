---
name: jgengine-verify
description: Prove code, scene, gameplay, and visual claims with proportional evidence.
---

# JGengine verification

Verification follows risk: cheapest deterministic evidence first, visual/browser evidence only for claims pixels or interaction uniquely prove.

## Core ladder

1. Run focused type/tests while iterating.
2. Assert pure rules and serialized transitions in tests.
3. Assert scene/environment data through `summarizeEnvironment`, voxel summaries, or authored-document queries.
4. Exercise gameplay progress when the loop can softlock.
5. Capture and inspect screenshots only for visual/layout/integration claims.
6. Run `bun run gate` before shipping; run `bun run ship:preflight` immediately before commit/push.

Use guarded repository scripts (`bun run test`, `bun run test:all`, `bun run gate`), not an unbounded bare `bun test` across the repository.

## Scene and gameplay proof

- Generated worlds assert resolved counts, finite/non-flat terrain where expected, palettes, bounds, and required features.
- Authored worlds assert required layers, objects, paths, markers, and ids from `editor.scene.json`.
- Gameplay tests prove the observable acceptance scenario, including save/restore or multi-client behavior when changed.
- `drive --playtest` with a declared capture probe is the softlock/progress rung for interactive loops.

## Visual proof

- Use preview states for deterministic HUD/menu captures; use `--mode play` for live integration and scene look.
- Menu-gated games declare capture commands/states rather than hand-driving setup repeatedly.
- Inspect desktop and mobile when responsive UI changes.
- Run pixel inspection for blank/sparse/contrast regressions, then open the PNG and judge it against the UI scorecard.
- If a WebGL capture hangs once, do not repeat the same foreground command; fall back to deterministic scene evidence and report the capture failure.
- Visual PRs embed final screenshots with `bun run pr-shots`; do not send binary images through GitHub content APIs.

## Evidence report

Report each applicable rung as pass/fail/skipped with the command or artifact: types, tests, world/document, gameplay, screenshot, pixel metrics, and visual score. A completion claim without the acceptance evidence is not complete.
