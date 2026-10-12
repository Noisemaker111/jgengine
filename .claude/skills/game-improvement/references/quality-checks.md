# Game quality checks

Use these when specifying and judging a substantial improvement. They supplement the domain skills; they are not another engine API or visual rubric.

## Decisions and depth

For each important decision record the situation, information available before commitment, viable alternatives, cost/risk, immediate response and consequence for later play. Test two contrasting strategies under at least two relevant conditions. If the same option wins regardless of condition, the proposed choice may be decorative. A deliberate low-pressure or expressive game can prove depth through planning, relationships, experimentation or composition rather than combat difficulty.

Connect mechanics explicitly: show how one system changes another system's options. An upgrade needs to enable or reshape a decision; a new mission needs a changed constraint, topology, opponent behavior, information state or consequence. More health, more enemies, more furniture or another delivery destination alone does not establish depth. Include an achievable stopping point and a reason the next session differs.

For a representative session, specify what is taught safely, tested independently, combined and transformed. Identify solved repetition and remove it or introduce relevant new information. Choose session-length and onboarding targets for the particular game; do not impose a universal campaign length.

## Ground, grass and environment

Inspect the normal play camera before choosing a material. A pretty overhead editor view does not prove a walkable or readable world.

- Define the ground's purpose: traversal, obstacle, cover, plot, track, danger, boundary or background. Its appearance must agree with its movement and collision rules.
- Author surface regions and transitions: road, dirt, stone, lawn, scrub, wet edge or industrial flooring as appropriate. Control world-space texture scale, tiling, roughness, value and color variation. Check grazing angles and close movement for swimming textures or obvious repetition.
- Grass belongs to suitable regions and clearings. Vary clumps and silhouettes coherently; avoid uniform height/density or one model repeated everywhere. Keep paths, spawn footing, placement targets, pickups and hazards readable. Verify terrain conformance, scale, clipping and shadow behavior through the shared runtime.
- Shape foreground, middle distance and background around routes and landmarks. Add spatial detail that serves the place; do not hide empty content behind bloom, darkness or fog.
- Indoor and paved games may need no grass. Judge their floor transitions, edge wear, structures and landmarks instead; do not force a lawn into every game.
- Check supported quality settings and a populated representative scene. Dense vegetation must use available bounded scatter, culling and batching seams. Record draw calls, triangles, active entities and measured frame behavior with the capture overhead and hardware context; a tiny scene or headless FPS alone cannot prove performance.

Record scene revision, semantic ids, catalog/material ids and authoring operations in delivery evidence. In JGengine, make world changes through editor GUI/RPC/CLI, never hand-edited scene JSON or placement arrays in runtime code. Unsupported authoring is an explicit engine gap.

## Acceptance

Separate three verdicts:

- **Rules:** meaningful alternatives, resource transitions, rewards, recovery, save/restore and repeat play behave under deterministic tests.
- **Experience:** the actual game has been driven through the claimed journey, with readable cues, responsive input, changed decisions, payoff and usable retry. Source-only and harness-limited findings remain labeled.
- **Presentation:** inspected active-play captures show the intended world, material scale, silhouettes, interface and action feedback. Apply `jgengine-verify`'s existing visual scorecard rather than inventing a competing score. Missing evidence is unproven, not a pass.

A small verified slice can be delivered honestly while the larger plan remains open. Do not call the game deep, polished or finished until the relevant experience and presentation claims have evidence. Revisit the weakest remaining dimension instead of averaging a broken loop against attractive art.
