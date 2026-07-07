---
name: jgengine-harvest
description: End-of-build engine-harvest for JGengine. Invoke this the moment a game built with jgengine is "done" — right after a "make ___ with jgengine" run that took several QA passes of fixing camera feel, icons, health bars, damage numbers, death screens, loot toasts, first-person feel, or terrain clipping. Also invoke on "harden the engine", "turn these fixes into primitives/defaults", "why did I have to fix this by hand", "make this setup easier next time", "how could I have built this 90% faster", "what better primitives or premade components would have helped", or any postmortem/retro of a finished build. Every hand-fix during that build is a system the engine could have owned; this skill extracts each one down to its game-agnostic core and files it as its OWN typed GitHub issue on the jgengine repo — `[Gap]`, `[Primitive]`, `[Component]`, `[Scaffold]`, `[Speed]`, or `[Doc]` — one system per issue, so the next game of this shape reuses it instead of rebuilding it.
---

# JGengine — Harvest the build, extract the systems

A build that took five QA passes to feel right is five systems the engine could have owned. Every hand-fix that made the game feel right is a reusable capability that got trapped inside one game — this skill runs at the end of a build, **extracts each one down to its game-agnostic core**, and files it as its own issue on [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues). "The game feels good now" is not the finish line; "the next game of this shape reuses these instead of rebuilding them" is.

**The deliverable is one issue per extractable system — not a report, not a code change.** This skill runs in the *build* conversation, which is rarely the place to touch engine internals (you might be in a game package, a consumer project, or deep in build context). So the output is a set of `gh issue create` calls — one per system — that a human triages and lands per PR in the engine repo. Each issue is **typed in its title** so the tracker sorts itself:

| Title tag | What it captures |
|-----------|------------------|
| `[Gap]` | A capability the engine has none of — a second game of any genre would hit the same wall |
| `[Primitive]` | One reusable verb/helper the game hand-rolled that the engine should own (`floatText`, `spawnOnSurface`, a cooldown clock) |
| `[Component]` | A whole UI cluster the next game would re-assemble identically — ship it *assembled and themeable* (garage screen, unit frame, minimap, scoreboard) |
| `[Scaffold]` | A generator or project scaffold that erases repeated boilerplate (catalog from `base × material × tier`, a starter file tree) |
| `[Speed]` | The build-collapsing lever — an archetype recipe or bundle that makes the next game of this shape 90% faster |
| `[Doc]` | A skill-doc gap: the builder could have gotten it right on turn one if a skill had set the bar or forced the decision |

## The one rule that makes an extraction worth filing: de-scope it to its core

An issue that says "port my BuildingGenerator" is worthless — it's project-locked. An issue that says "the engine has no procedural building-mesh factory; a second city/sim game re-derives facade/floor/roof assembly by hand — the reusable core is `(footprint, height, styleParams) → mesh`, and the game supplies only the style palette" is a primitive someone can build once and every game reuses. **Every issue names the game-agnostic core and draws the line between what the engine should own (the mechanism, the math, the layout, the states) and what stays game content (the numbers, the fantasy, the palette).** That split *is* the extraction. Without it you've filed a feature request for one game; with it you've filed a primitive for all of them. This is the whole job — "so it's a million times easier to make again, without being 100% project-scoped."

You may name the shape of the extraction — the verb and its signature, the component and what it's passed vs what it gives for free, the scaffold's inputs. You are **not** implementing it or writing its code into the issue; you are handing a human a well-scoped, de-scoped target they can fact-check and build in a PR. Name the core; stop before the implementation.

## Read first

Read `jgengine-api` (the engine surface — most "missing" primitives already exist, and every extraction must respect the layer that owns it) and skim `jgengine-ui` + `jgengine-assets` (the quality bars a `[Doc]` gap failed to enforce). You cannot tell whether something is a real gap — or already-shipped surface the build just didn't find — until you know what the engine ships. Knowing the layering also keeps an extraction honest: `core` imports no React/three/browser, `react` adds hooks + headless components, `shell` is the only renderer.

## Step 1 — Reconstruct the friction log

Every correction the user made during the build is one entry. Pull them from the conversation history (or the summary the user pasted). Each user turn that said "it looks good but…", "that's terrible", "borderlands is first person", or "keep going" after an interruption is a place the engine or the skills let the builder down.

For each, record the **symptom** (what the user saw) and the **fix that was applied game-side** (the glue that made it right this once):

| Symptom the user reported | Fix that was hand-written in the game |
|---------------------------|----------------------------------------|
| Enemy health bars floated in screen space, not over enemies | Custom world-projected bar math in the game's UI |
| No damage numbers over enemies | Per-game float-text component + tick spawner |
| Icons were generic / "fucking terrible" | Hand-drawn weapon silhouettes in the game |
| Enemies spawned clipping into terrain | Per-game ground-height sampling before spawn |
| Shooting felt like MMO targeting, not a shooter | Game-side reticle + viewmodel + projectile tracer |

The fix column is the important one: **hand-written glue is the shape of the missing primitive.** If the game had to compute it, the engine probably should have.

## Step 2 — Extract the core and pick the type

For each friction point, do two things: **draw the de-scope line** (reusable core vs game content), then **assign exactly one title tag** from the table above. The tag is the only classification judgment the skill makes — it decides *what kind of issue gets filed*, and whether it gets filed at all.

- If a *second* game of any genre would need this same mechanism, it's extractable — tag it `[Gap]`, `[Primitive]`, `[Component]`, `[Scaffold]`, or `[Speed]` by shape (see the tag table and Step 3).
- If a skill could have prevented the mistake by setting a bar or forcing a decision up front, it's `[Doc]`.
- If what's left after de-scoping is *only* content or a number unique to this fantasy (one game's contract copy, one gun's exact recoil curve) — there's no reusable core — **don't file it.** Leave it in the game; filing it is noise.

Most friction has a real core. A builder shipping screen-space health bars is rarely lazy — the engine never gave them a world-space one. Frame each extraction that way: it's a wall the engine put up, not a mistake to blame.

## Step 3 — Shape each extraction in the layer that owns it

The tag implies a shape, and the shape implies a layer. Naming both is what makes the issue actionable instead of a wish:

| Tag | The reusable core looks like | Lands in |
|-----|------------------------------|----------|
| `[Gap]` / default | Behavior that should just happen with zero game code (spawn resolves to the surface; a tuned camera-follow feel) | `core` (scene/runtime) or `PlayableGame.camera` defaults |
| `[Primitive]` | One verb + signature (a `floatText`/damage-number verb over scene entities; a loot-toast channel over `ctx.game.feed`; a cooldown clock) — the test: with it, the game's version is *deleted*, not wrapped | `core` (+ a `shell` renderer if it draws in the scene) |
| `[Component]` | A headless kit the game only themes and feeds content: name it, say what's passed in (content, theme) vs free (layout, states, behavior) | `react` (screen-space) / `shell` (in-scene) |
| `[Scaffold]` | A generator's inputs → output (a `base × material × tier` catalog expander; a `create-jgengine-game` file tree; a keybind/UI skeleton) | tooling / `skills/jgengine-newgame` recipe |
| `[Speed]` | The archetype cluster and whether it's a documented recipe or an earned engine bundle (see Step 4) | `skills/jgengine-newgame` recipe, or an engine preset only if a 2nd game will use it |
| `[Doc]` | A rule or decision, not code (ask perspective up front; ban placeholder icons harder; forbid persistent keybind legends) | the relevant `skills/*` |

Respect the engine's own rules when you name a shape: no code comments (intent goes in types/names), dense catalogs over micro-modules, strict TS with no `any`, and **no speculative config** — a `defineGame` field or preset earns its place only with a live consumer. A world-space bar or viewmodel renders in the scene, so it's `shell`, never `core`. If, after de-scoping, a fix is pure content with no reusable verb underneath, it was game-specific — recheck Step 2 and don't file it.

## Step 4 — The 90% lever: find the cluster before you file

Per-fix extractions each remove one paper cut; the biggest issue you file is the one that collapses the **whole** build. After tagging everything, step back and ask the blunt question the user actually cares about — *"what would have made this build 90% faster?"* — and answer it concretely. It almost always lives where the wall-clock actually went, so say where the time went.

Look for **clusters** — several friction points serving one archetype (viewmodel + reticle + tracer + hip/ADS + spawn-on-ground all say "FPS feel"; garage + tune-sheet + stat-bars + car-select all say "racer feel"). A cluster is a `[Speed]` issue: the recipe or bundle that makes the next game of this shape start where this one *ended*. One game is a probe; two games is a primitive — don't propose an engine preset for a setup only one game has ever needed; propose the **recipe** (a `jgengine-newgame` archetype) and let a second game promote it to code. File the `[Speed]` issue *in addition to* the per-part `[Primitive]`/`[Component]` issues it clusters, and say in its body which issues it groups — that cross-link is exactly what a human triaging the tracker needs.

## Step 5 — File one issue per extraction

**Checkpoint first.** Before filing, list every issue you're about to open — title tag + one-line core each — and let the user react. This is the one gate: after it, each becomes a real issue in the tracker. Skip anything they call a duplicate or not worth filing.

Ensure the labels exist once, then file one issue per system — never merge two systems to save a call:

```
gh label create harvest --description "surfaced by jgengine-harvest" --color FBCA04   # once, ignore if it exists

gh issue create --repo Noisemaker111/jgengine \
  --title "[Component] No premade unit-frame kit — every RPG re-assembles portrait + bars + buffs by hand" \
  --label "harvest" \
  --body "$(cat <<'EOF'
Reusable core: an engine-owned, headless unit-frame kit — portrait slot + labeled resource bars (health/mana/resource) + buff row + target-of-target — shipped assembled and themeable. The game passes content (which stats, which portrait, a theme className) and gets layout, bar fill/animation, and empty/dead/out-of-range states for free.

Engine owns: the cluster's layout, the bar behavior and states, the buff-row wiring.
Game owns: which stats map to which bar, the portrait art, the theme.
Why extract: a second RPG/MMO re-assembles this identically out of SlotGrid/HealthBar primitives; ~90% of it is the same every time.

Observed while building: <game name>, spent <~N passes / hours> hand-wiring the target + player frames.
EOF
)"
```

Body shape for every tag: **Reusable core** (the de-scoped mechanism, and the shape/signature if you can name it), the **engine-owns / game-owns split**, one line on **why a second game needs it**, and one line of **build context**. For `[Doc]`, "reusable core" becomes "the rule to add and which skill enforces it." Never paste implementation code into an issue — name the shape and stop.

## Step 6 — Say what you didn't file

Close by telling the user, in words, what stayed in the game (Step 2's no-core case) and why — so they know it was considered, not missed. If several issues share one root (viewmodel + reticle + tracer all serving "FPS feel"), say so and name the `[Speed]` issue that groups them, even though you filed each separately — that pattern is what a human triaging the tracker most needs flagged.

## Anti-patterns

| Wrong | Right |
|-------|-------|
| "Port my BuildingGenerator" / a project-locked feature request | De-scope to the game-agnostic core + the engine-owns/game-owns split (the one rule) |
| One giant paste-ready report | One `gh issue create` per system — that's the point of routing through the tracker |
| Two systems bundled into one issue because they felt related | File two — one system each, even if they cluster (link them from a `[Speed]` issue) |
| Untitled / untyped issues | Every title leads with a tag: `[Gap]` `[Primitive]` `[Component]` `[Scaffold]` `[Speed]` `[Doc]` |
| Pasting the game's implementation code into the issue | Name the shape/signature and the split; the code is a human's PR, made later |
| Filing only per-fix items, never the build-collapsing lever | Step 4: the `[Speed]` cluster is the highest-value issue, and it lives where the wall-clock went |
| Filing game-specific content/numbers | No reusable core after de-scoping → leave it in the game, don't file noise |
| World-space bar / viewmodel scoped to `core` | Renders in the scene → `shell`; core imports no three.js |
| An engine preset for a setup exactly one game has used | A `[Speed]` **recipe** in `jgengine-newgame`; let a second game promote it to code |
| Filing without showing the user the list first | Step 5's checkpoint — list tag + one-line core, let them veto, then file |
| "The game feels good now, done" | Done = every extractable system from this build has its own typed, de-scoped issue |

## Worked example — the Borderlands run

Filed as separate typed issues (one `gh issue create` each), each de-scoped to a reusable core:

1. **`[Gap]` Health bars render in screen space, not anchored to entities** — core: the engine has no world-to-screen anchor for UI over a scene entity, so every game re-derives screen position from world position by hand. Engine owns the projection + occlusion; game owns the bar content. → `shell` projection, headless `HealthBar` stays `react`.
2. **`[Primitive]` No transient positioned combat event (damage numbers, hit sparks)** — core: a `floatText`/combat-event verb over scene entities. Engine owns the spawn/lifetime/positioning; game owns the text and style. With it, the game's per-tick float spawner is *deleted*. → `core` verb + `shell` renderer.
3. **`[Gap]` Entities can spawn inside terrain geometry** — core: spawn doesn't resolve the point against ground height; a `spawnOnSurface` default so nothing clips, zero game code. → `core` scene default.
4. **`[Component]` No death-screen / level-up / loot-toast kit** — core: three headless `Screen`-based components + a toast channel over `ctx.game.feed`, themeable, content-only. → `react` + `core`.
5. **`[Speed]` No first-person "shooter feel" bundle** — cluster of viewmodel + reticle + projectile tracer + hip/ADS + spawn-on-ground. Core: the FPS-feel recipe. One game is a probe → propose it as a `jgengine-newgame` archetype; groups issues 2–3 and the viewmodel/reticle primitives. → `skills/jgengine-newgame` recipe (+ `shell` viewmodel/reticle primitives filed under it).
6. **`[Doc]` Perspective (first vs third person) is never decided until something already feels wrong** — rule: the blueprint must force the perspective decision up front. → `jgengine-newgame`.

Left unfiled, said out loud to the user: contract-specific UI copy and the exact recoil numbers — no reusable core after de-scoping, so they stay this game's content. Flagged: issues 2, 3, and the viewmodel/reticle work all serve the same "no FPS-feel path exists yet" cluster — filed separately, grouped under the issue 5 `[Speed]` recipe so triage sees the pattern.
