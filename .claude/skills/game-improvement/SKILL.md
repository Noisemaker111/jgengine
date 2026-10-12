---
name: game-improvement
description: Improve existing games through ordered design, mechanics, world, art and playtested implementation.
---

# Improve a game

Use this skill to carry a game from diagnosis through a proven playable improvement. A plan is the working contract; it does not satisfy a request to implement improvements. Keep each game's identity and scope. Depth comes from interacting choices and changing situations, not an inflated feature or content count.

In JGengine, read repository governance and use the existing owners: `game-design` for decisions and progression, `level-design` for space, `jgengine-editor` for authoring, `jgengine-assets` for catalogs, `jgengine-world` for runtime and sound, `jgengine-ui` for presentation, and `jgengine-verify` for evidence. Reuse their workflows and APIs rather than reproducing them here. Do not impose genre kits or one visual style on every game.

## Make the plan

Write plain numbered steps in the order work happens. Each delivers a concrete player-facing result and states how it is checked. Put verified progress above the steps and unfinished work below them. Store project-specific plans in the project's issue/PR, not in the reusable skill. Read [references/quality-checks.md](references/quality-checks.md) for the decision, terrain and completion checks.

1. **Establish the actual game.** Drive its opening, objective, failure and retry where possible; inspect its rules, authored scene and installed SDK. Record observations separately from source findings and proposals. Capture the actual play view, including the ground at the normal camera height. Establish what must survive the redesign.
2. **Give it a clear identity.** Define the player promise, a few observable pillars, the main decision and the experience to avoid. Describe what the player learns and does in the first minute, first objective and representative session. Reject an identity that is only a genre name or marketing sentence.
3. **Prove an interesting core.** Build one complete slice around the riskiest decision. Make options differ in cost, risk, timing, information or future capability. Give the action immediate feedback and a consequence that changes the next choice. Test contrasting strategies before adding missions, unlocks or scenery.
4. **Make the loop sustain itself.** Connect resources, challenge, rewards, progression and recovery. Plan later situations that recombine the proven mechanics. Explain how a reward changes play and how a player recovers from failure. Check starting resources, an unsuccessful run, a successful run and repeat play; tune numerical hypotheses from those results.
5. **Design the playable space.** Measure movement, camera, interaction and combat limits. Author routes, boundaries, objectives, safe footing, encounter positions and landmarks through the editor. Make alternate routes have different gameplay consequences. Verify the same scene data drives rendering, collision and gameplay before decorating it.
6. **Finish the world and art.** Choose a coherent palette, silhouettes, material scale, lighting and atmosphere for this particular place. Replace unintentional placeholders with resolved assets. Treat ground and grass as authored surfaces with composition, boundaries and readable traversal, not a green fill plus random scatter. Use the terrain checks below; verify close, middle and distant play views and representative scene load.
7. **Make play feel and read well.** Tune response, camera and action feedback. Compose a distinctive HUD and menus that explain goals, affordances, consequences and recovery. Add event-driven sound and visual cues where they convey play. Check supported inputs and screen sizes, menu focus, saves and return to play. Fix generic behavior in its shared package owner.
8. **Try a complete session.** Drive onboarding, the core decision, contrasting strategies, payoff, failure, retry and a later objective. Test whether players can explain their goal, options and consequences without coaching. Record tuning changes and failed hypotheses. Do not substitute unit tests or a posed screenshot for this journey.
9. **Judge and deliver the result.** Use inspected before/after play captures, deterministic checks and the existing visual scorecard. Obtain an independent review when available. Ship the coherent slice through the repository workflow, then continue the remaining plan. State exactly which experience is proven and which quality goals remain unproven.

## Several games

Apply the steps to every named game independently. Keep a plan and evidence for each; never mark the portfolio improved because one game passes. Find shared defects once, assign their engine owner, and adopt the published fix without copying it into eight games. Delegate independent game work with disjoint ownership when repository instructions authorize it. Coordinate shared dependencies and landing in one place.

Start with a complete representative improvement in each game, then expand only the mechanics that survive play. Preserve the player's existing saves or document a deliberate migration. When a capability or tool is missing, name the exact gap, complete independent work and keep the dependent step visibly open; do not silently substitute hardcoded world content or claim a finished game.
