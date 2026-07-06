---
name: jgengine-harvest
description: End-of-build engine-harvest for JGengine. Invoke this the moment a game built with jgengine is "done" — right after a "make ___ with jgengine" run that took several QA passes of fixing camera feel, icons, health bars, damage numbers, death screens, loot toasts, first-person feel, or terrain clipping. Also invoke on "harden the engine", "turn these fixes into primitives/defaults", "why did I have to fix this by hand", "make this setup easier next time", "how could I have built this 90% faster", "what better primitives or premade components would have helped", or any postmortem/retro of a finished build. Every hand-fix during that build is a bug report the engine never received; this skill classifies them and emits ONE paste-ready report — a prompt you carry back to the jgengine repo — so the next build of the same shape gets it right on turn one.
---

# JGengine — Harvest the build, harden the engine

A build that took five QA passes to feel right is five bug reports the engine never received. Every hand-fix that made the game feel right is a gap the engine should have covered — this skill collects them at the end of a build so the engine can be fixed and the same friction becomes **impossible or automatic** next time. "The game feels good now" is not the finish line; "the next game of this shape needs zero of these fixes" is.

**The deliverable is one report, not a code change.** This skill usually runs in the *build* conversation — which may not be the place to touch engine internals (you might be in a game package, deep in build context, or a consumer project entirely). So the output is a single **paste-ready prompt** you carry back to a fresh conversation in the jgengine repo, where the fixes actually land. Think of it as writing the bug reports the engine should have gotten — except structured so the receiving conversation can implement straight from them. The classification below is what makes the report worth pasting; a flat "here's what I fixed" list is not.

One thing the report must carry, because its recipient is inside the engine repo: **fix the gaps directly, don't file issues.** A consumer on the published SDK files at [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues); in-repo, closing the gap *is* the job. The report says so at the top so the next conversation doesn't just re-log everything.

## Read first

Read `jgengine-api` (the engine surface — most "missing" primitives already exist, and every fix must land in the layer that owns it) and skim `jgengine-ui` + `jgengine-assets` (the quality bars a skill-doc gap failed to enforce). You cannot classify a friction point as an engine gap until you know what the engine already ships.

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

## Step 2 — Classify each entry (the whole game is here)

Sort every friction point into exactly one bucket. This judgment is the skill:

| Bucket | Test | What the report says to do |
|--------|------|-----------------------------|
| **Engine gap** | Would a *second* game of any genre need this same glue? (world-space bars, damage floats, death screen, loot toast, level-up flash, camera-follow feel, hotbar-selection highlight, spawn-on-surface, first-person viewmodel) | Fix the engine — default, primitive, headless component, or shell feature (Step 3) |
| **Skill-doc gap** | Could the builder have gotten it right on turn one if a skill had set the bar or made the decision explicit? (perspective never asked; "generic icons" not forbidden hard enough; a persistent keybind legend the UI skill should ban; contract/quest UI below the quality bar) | Sharpen the skill doc so the next build can't regress — `jgengine-ui`/`jgengine-assets`/`jgengine-newgame`/`jgengine-api` |
| **Genuinely game-specific** | Is this content or a number unique to *this* fantasy? (Borderlands' contract copy, one gun's exact recoil curve) | Leave it in the game. Not every fix is an engine's job — resist gold-plating |

Most friction is one of the first two. A builder shipping screen-space health bars is rarely lazy — the engine never gave them a world-space one, and no skill told them the bar belongs over the enemy. Frame it that way: the report removes the *possibility* of the mistake, not the blame for the last build.

## Step 3 — Pick the intervention, in the layer that owns it

For each engine gap, name the lightest fix that makes the friction stop recurring — and where the layering puts it. `core` imports nothing (no React/three/browser); `react` adds hooks + headless components; `shell` is the **only** renderer (three.js, viewmodels, world-space overlays). A world-space health bar in `core` is not a shortcut, it's a layering break — and the report must land it right or the receiver will bounce it.

| Intervention | When it fits | Lands in |
|--------------|-------------|----------|
| **Default** — behavior just happens, zero game code | The right thing should never have needed opting in (spawn on the surface so nothing clips; a tuned camera-follow feel) | `core` (scene/runtime) or `PlayableGame.camera` defaults |
| **Primitive / helper** — one reusable verb | Several games call the same computed action (a `floatText`/damage-number verb, a loot-toast feed channel over the existing `ctx.game.feed`) | `core` |
| **Headless component** — engine ships behavior, game passes content | Screen-space HUD the game only themes (death screen via `Screen`, level-up flash, a labeled world/unit health bar) | `react` |
| **Shell feature** — anything that renders in the 3D scene | First-person viewmodel, reticle, projectile tracer, world-space bar projection | `shell` |
| **Skill-doc rule** — make the mistake un-shippable | The fix is a decision or a bar, not code (ask perspective in the blueprint; ban persistent keybind legends; forbid placeholder icons harder) | the relevant `skills/*` |

Honor the engine's own rules while proposing: no code comments (encode intent in types/names), dense catalogs over micro-modules, strict TS with no `any`, and **no speculative config** — a `defineGame` field or preset earns its place only with a live consumer. If a fix is pure content with no reusable verb underneath, it was game-specific; recheck Step 2.

## Step 4 — The speed lever: could this build have been 90% faster?

Per-friction fixes each remove one paper cut; the real prize is the lever that collapses the **whole** build. After classifying, step back and ask the blunt question the user actually cares about — *"is there any way I could have made this process 90% faster?"* — and answer it concretely, not with a shrug. The answer lands in the report as its own section, because it's the highest-value thing the harvest produces. Probe three axes:

- **Better primitives** — where did the game hand-roll math or wiring the engine should own as one verb? A calculation you patched in five places is a primitive whose absence taxed the entire build (a `floatText`/damage-number verb, a `spawnOnSurface` default, a camera-follow feel, a cooldown clock). Name the verb, its signature, and the layer (`core` default/helper, `react` hook). The test: with the verb, the game's version is *deleted*, not wrapped.
- **More premade components** — where did the game assemble a whole UI cluster out of headless parts that the next game of this shape would assemble identically? A garage screen, inventory grid, minimap, scoreboard, lap/timer HUD, unit frame — if it's ~90% the same every time, it's a **kit** the engine should ship *assembled and themeable*, not a pile of `SlotGrid`/`HealthBar` primitives to re-wire by hand. Name the component, what the game passes in (content, theme) versus what it should get for free (layout, states, behavior). This is the biggest time sink in most builds — weight it accordingly.
- **Scaffolds & generators** — where did hand-typing eat hours that a generator or `create-jgengine-game` scaffold would erase? Catalog breadth from `base × material × tier` arrays, a starter file tree, a keybind/UI skeleton. If the build spent its first hour on boilerplate every game repeats, that's a scaffold gap.

Then look for **clusters** — several friction points serving one archetype (viewmodel + reticle + tracer + hip/ADS + spawn-on-ground all say "FPS feel"; garage + tune-sheet + stat-bars + car-select all say "racer feel"). A cluster is the signal for the largest lever: a documented recipe in `jgengine-newgame`, or — only if a second concrete game would use it — an engine-owned preset/bundle/kit so the common case is one call, not a scavenger hunt. One game is a probe; two games is a primitive: don't ship a preset for a setup only one game has ever needed — propose the recipe, and let the second game promote it to code. **Where the build spent the most wall-clock is the loudest signal — the 90% lever almost always lives there**, so say where the time actually went.

## Step 5 — Emit the report (the deliverable)

Your final output is one self-contained report, and it is the whole point of the skill — write it to be pasted verbatim into a fresh jgengine-repo conversation, carrying enough context that the receiver never needs the build history. Use this structure exactly:

```
# This is the report to fix or implement — <game name> harvest

Built <game> with jgengine; it took <N> QA passes to feel right. Each item below is
a fix that was hand-written in the game because the engine or a skill didn't cover it.
You are in the engine repo: implement these directly — fix the primitive, default,
component, or skill doc. Do NOT file issues (that's the external-consumer path).
Read jgengine-api before starting; land each fix in the layer that owns it.

## Engine gaps — implement in code
| # | Symptom the player saw | Glue the game hand-wrote | Proposed fix | Layer / target |
|---|------------------------|--------------------------|--------------|----------------|
| 1 | …                      | …                        | …            | core / shell / react |

## Skill-doc gaps — sharpen the spec so it can't regress
| # | What shipped wrong | Which skill failed to prevent it | Rule to add |
|---|--------------------|----------------------------------|-------------|

## Speed lever — how the next build of this shape goes 90% faster
Where the build's wall-clock actually went: <the 1–2 things that ate the most time>
- **Better primitives**: <verbs the engine should own so this math/wiring is never hand-rolled again — signature + layer>
- **Premade components / kits**: <whole UI clusters the engine should ship assembled + themeable, content-only — name + what's passed in vs free>
- **Scaffolds / generators**: <catalog generators or a project scaffold that erases the repeated boilerplate>
- **Archetype recipe / preset**: <the cluster, and whether it's a jgengine-newgame recipe or an earned engine preset/bundle>

## Left in the game — no action
<game-specific content/numbers, listed so the receiver knows they were considered and skipped>

## Definition of done for this report
- [ ] each engine gap consumed by the game, its hand-written workaround DELETED
      (if deleting the glue breaks the behavior, the primitive is wrong-shaped — fix the primitive)
- [ ] `bun run build` + `bun run check-types` green; `bun test packages` for any math added
- [ ] every visual fix: `bun run shoot <gameId> --mode ui` and LOOK at the PNG — type-green
      says nothing about whether a world-space bar renders over the enemy; new HUD needs its
      Tailwind `@source` wired or it renders unstyled
- [ ] each skill-doc rule written into its `skills/*` file — a fix that lives in code but not
      the doc reappears the next time someone reads the doc instead of the code
```

Before emitting, show the user the classified table and let them react — this is the one checkpoint. Everything the build already fixed is settled; only *where each fix should live* and *whether it's worth harvesting* is open. Then print the full report so they can copy it.

If this harvest is already running inside the engine repo and the user wants to keep going rather than hand off, the same report is your worklist — walk its Definition of done top to bottom. The report is still the artifact; implementing it is just the next conversation happening now instead of later.

## Anti-patterns

| Wrong | Right |
|-------|-------|
| Report tells the receiver to file issues | The report lands in the engine repo — fix directly; issues are the external-consumer path only |
| A flat "here's everything I fixed" dump | Classify first — the buckets are what make the report worth pasting (Step 2) |
| Reports only per-fix gaps, never the build-collapsing lever | Step 4: name the primitive, premade kit, or scaffold that makes the next build of this shape 90% faster — that's the highest-value row, and it lives where the wall-clock went |
| "The game feels good now, done" | Done = the report exists and the next game of this shape needs none of these fixes |
| Promote every hand-fix to a primitive | Classify first; game-specific content stays in the game (Step 2) |
| World-space bar / viewmodel proposed for `core` | Renders in the scene → `shell`; core imports no three.js (Step 3) |
| A preset for a setup exactly one game has used | Recipe in `jgengine-newgame`; let the second game promote it to code |
| Report lists code fixes but forgets the skill-doc gaps | Skill-doc gaps are half the value — a code-only fix ships again the next time someone reads the doc |
| Report proposes a primitive, never says to delete the game's workaround | The Definition of done requires consuming it in the game and deleting the glue — that's the proof and the regression guard |
| "Trust check-types" for visual fixes | The report's done-check says screenshot and look at it |

## Worked example — the Borderlands run

The build's QA passes, harvested into report rows:

| Symptom | Bucket | Proposed fix → layer |
|---------|--------|----------------------|
| Health bars in screen space, not over enemies | Engine gap | World-space bar projection → `shell`; labeled `HealthBar` stays headless in `react` |
| No damage numbers over enemies / player | Engine gap | A float-text verb over scene entities → `core` primitive, rendered by `shell` |
| Death screen, level-up animation, loot toast | Engine gap | Headless `Screen`-based components + a toast feed channel over `ctx.game.feed` → `react` + `core` |
| Enemies clip into terrain on spawn | Engine gap | Spawn resolves to the surface by default → `core` scene, no game code |
| MMO-feeling shooting; no reticle/viewmodel/tracer | Engine gap (cluster) | First-person viewmodel + reticle + projectile tracer → `shell`; documented as the FPS recipe in `jgengine-newgame` |
| Never asked first- vs third-person | Skill-doc gap | Blueprint must state perspective up front → `jgengine-newgame` |
| Generic / placeholder icons | Skill-doc gap | Ban placeholder item icons at the quality bar → `jgengine-ui` + `jgengine-assets` |
| Persistent on-screen keybind legend | Skill-doc gap | Bindings live on their control, never a constant legend → `jgengine-ui` |
| Contract-specific UI copy and numbers | Game-specific | Stays in the game |

The lesson the table encodes: five rounds of "it's still not right" were mostly one FPS-feel cluster plus a handful of quality bars the skills never enforced. Harvest them into one report, fix them once, and the next "make an FPS with jgengine" starts where this one *ended*.
