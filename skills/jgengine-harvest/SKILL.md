---
name: jgengine-harvest
description: End-of-build engine-harvest for JGengine. Invoke this the moment a game built with jgengine is "done" — right after a "make ___ with jgengine" run that took several QA passes of fixing camera feel, icons, health bars, damage numbers, death screens, loot toasts, first-person feel, or terrain clipping. Also invoke on "harden the engine", "turn these fixes into primitives/defaults", "why did I have to fix this by hand", "make this setup easier next time", "how could I have built this 90% faster", "what better primitives or premade components would have helped", or any postmortem/retro of a finished build. Every hand-fix during that build is a problem the engine never got told about; this skill turns each one into its OWN GitHub issue on the jgengine repo — one problem per issue, stated in plain words, no proposed fix, no code — so a human can fact-check and triage before anything gets built.
---

# JGengine — Harvest the build, file the problems

A build that took five QA passes to feel right is five problems the engine never got told about. Every hand-fix that made the game feel right is a gap the engine should have covered — this skill collects them at the end of a build and files each one as its own issue on [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues), so a human can later fact-check and knock them out per PR. "The game feels good now" is not the finish line; "the next game of this shape needs zero of these fixes" is.

**The deliverable is issues, not a report and not a fix.** This skill runs in the *build* conversation, which is rarely the right place to touch engine internals (you might be in a game package, a consumer project, or deep in build context). The output is one `gh issue create` per problem — not a single paste-ready wall of text, and not a code change. This is deliberate: an agent that also proposes and half-implements the fix is an agent whose diagnosis gets trusted blindly later. **State the root problem, in words, and stop.** No proposed fix, no layer/target guess, no code, no "here's how I'd solve it." A human reviews the raw list of problems in the tracker and decides what's real and what to build — that's the whole point of routing through issues instead of a conversational handoff.

Every issue is a **problem**, not a solution and not a symptom-only bug report. State what's actually wrong at the root — not just what the player saw, and not a fix. "Health bars render in screen space" is the symptom; "the engine has no world-space UI-anchor primitive, so every game re-derives screen position from world position by hand" is the problem. Say the problem in one paragraph of plain words. That's enough for a human to act on — don't reach for a diagram, a snippet, or a proposed API to prove it.

## Read first

Read `jgengine-api` (the engine surface — most "missing" primitives already exist) and skim `jgengine-ui` + `jgengine-assets` (the quality bars a skill-doc gap failed to enforce). You cannot tell whether something is really a gap until you know what the engine already ships — but knowing the surface is only for filtering out non-problems (Step 2), never for drafting the fix. The issue states the problem; it does not cite the API you'd use to solve it.

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

## Step 2 — Classify, to filter out non-problems (not to pick a fix)

Sort every friction point into exactly one bucket. This is the only judgment call the skill makes — it decides *whether an issue gets filed*, never what the fix is:

| Bucket | Test | Gets filed? |
|--------|------|-------------|
| **Engine gap** | Would a *second* game of any genre hit this same wall? (world-space bars, damage floats, death screen, loot toast, level-up flash, camera-follow feel, spawn-on-surface, first-person feel) | Yes — one issue |
| **Skill-doc gap** | Could the builder have gotten it right on turn one if a skill had set the bar or made the decision explicit? (perspective never asked, placeholder icons not forbidden hard enough, a UI quality bar not enforced) | Yes — one issue |
| **Genuinely game-specific** | Is this content or a number unique to *this* fantasy? (one game's contract copy, one gun's exact recoil curve) | No — leave it in the game, don't file noise |

Most friction is one of the first two. A builder shipping screen-space health bars is rarely lazy — the engine never gave them a world-space one. Frame each issue that way: it's a wall the engine put up, not a mistake to blame.

## Step 3 — One problem, one issue, root-cause words only

This is the part that has to be disciplined, because it's the whole reason this routes through issues instead of a conversational handoff: **a dumb or overconfident agent filing a diagnosis is dangerous if the human trusts it blindly. A dumb agent filing a one-paragraph problem statement is cheap to fact-check.** So each issue:

- Is exactly **one** problem. Never bundle two symptoms into one issue because they felt related — file two issues. The reader triages one problem at a time; a bundled issue makes half of it un-closeable without touching the other half.
- States the **root problem in plain words** — what's actually missing or wrong, not just what the player saw, and not how to fix it. "Enemies clip into terrain on spawn" is the symptom; "the engine picks a spawn point without checking it against ground height, so any spawn near sloped or uneven terrain can land inside geometry" is the root problem in words.
- **Never proposes a fix.** No API name, no layer (`core`/`react`/`shell`), no function signature, no code snippet, no "this should probably be a default." If you know the fix, name the problem it solves instead of the fix itself — that's a harder discipline than it sounds, and it's the point: this skill filing a fix that turns out wrong is worse than filing nothing, because the human is the one who has to catch it.
- **Never speculates beyond what was observed.** If you don't know why something happened, say what was observed and that the cause is unconfirmed — don't guess an internal mechanism to sound complete.
- Is a paragraph of words, not a table, not a diagram, not a pasted component. If a reusable component came up during the build worth mentioning, name it and what it does in a sentence — don't paste its source into the issue.

## Step 4 — File one issue per problem

File with `gh issue create --repo Noisemaker111/jgengine`, once per problem from Step 3. Title is the short symptom; body is the root-cause paragraph plus one line of build context. Use this shape:

```
gh issue create --repo Noisemaker111/jgengine \
  --title "<short symptom, e.g. 'Enemies spawn clipping into terrain'>" \
  --label "harvest" \
  --body "$(cat <<'EOF'
Root problem: <one paragraph, plain words, no proposed fix, no code, no layer guess>

Observed while building: <game name>, <one line of what surfaced it>
EOF
)"
```

Run it once per entry from the friction log — do not merge entries to save calls. If `label:harvest` doesn't exist on the repo yet, create it first (`gh label create harvest --description "surfaced by jgengine-harvest" --color FBCA04`) rather than dropping the label.

Before filing, list the problems you're about to file (title + one-line root cause each) and let the user react — this is the one checkpoint, since after this each item becomes a real issue in the tracker. Skip anything they say is a duplicate or not worth filing. Then file the rest.

## Step 5 — Say what you didn't file

Close by telling the user, in words, what stayed in the game (Step 2's third bucket) and why — so they know it was considered, not missed. If several problems shared one root cause (e.g. viewmodel + reticle + tracer all missing FPS feel), say so explicitly even though you filed them separately — that pattern is exactly the kind of thing a human triaging the tracker needs flagged, and it's not your call to fold it into one issue or decide it's a preset.

## Anti-patterns

| Wrong | Right |
|-------|-------|
| One giant paste-ready report | One `gh issue create` per problem — that's the whole point of routing through the tracker |
| Issue proposes a fix, API, or layer | State the root problem in words only; the fix is a human decision made later, in a PR |
| Issue includes a code snippet or pasted component source | Name the component/behavior in a sentence; never paste code into an issue |
| Two symptoms bundled into one issue because they felt related | File two issues — one problem each, even if they turn out to share a cause |
| Guessing *why* something broke without having confirmed it | Say what was observed; flag the cause as unconfirmed if it isn't |
| Filing game-specific content as an issue | Classify first (Step 2) — content/numbers unique to this game stay in the game, no issue |
| Filing without showing the user the list first | Step 4's checkpoint — list title + root cause, let them veto, then file |
| "The game feels good now, done" | Done = every real friction point from this build has its own filed issue |

## Worked example — the Borderlands run

Filed as five issues (one call each), not one report:

1. **"Health bars render in screen space, not anchored to enemies"** — root problem: the engine has no world-to-screen anchor primitive for UI elements, so every game re-derives a screen position from an entity's world position by hand.
2. **"No feedback when an enemy takes damage"** — root problem: nothing in the engine represents a transient, positioned combat event (a hit, a number, a moment in time) that a game can render — it isn't wired into the scene at all right now.
3. **"Enemies can spawn inside terrain geometry"** — root problem: spawn placement doesn't check spawn points against ground height before placing an entity.
4. **"Shooting feels like point-and-click targeting, not aiming"** — root problem: there's no first-person aim/view path in the engine at all; a game wanting shooter feel has to build the whole perspective, reticle, and feedback loop itself with no starting point.
5. **"Perspective (first vs third person) is never decided until something already feels wrong"** — root problem: nothing in the build workflow forces this decision up front, so it surfaces mid-build as a rewrite instead of a planning question.

Left unfiled, and said out loud to the user: contract-specific UI copy and the exact recoil numbers — those are this game's content, not the engine's problem. Also flagged: issues 2, 4, and 5 all point at the same "no first-person / combat-feel path exists yet" gap — filed separately since each is independently true, but worth knowing they cluster before triaging.
