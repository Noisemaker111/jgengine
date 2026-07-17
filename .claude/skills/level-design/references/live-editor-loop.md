# Live editor loop

Use this protocol to turn live play evidence into safe, executable instructions for an agent controlling the JGengine editor. The level designer owns the hypothesis and acceptance criteria; the editor agent owns document operations. Never send “make this area better” or infer that a successful tool call changed runtime play.

## Contents

1. Closed loop
2. Authority and capability gate
3. Evidence packet
4. Editor-agent prompt contract
5. Mutation policy
6. Verification and iteration
7. Example: spawn repair

## 1. Closed loop

Repeat this sequence until the acceptance scenario passes or a stop condition is reached:

`capture -> inspect -> map pixels to scene/runtime ids -> form one spatial hypothesis -> brief editor agent -> author -> inspect document -> replay same scenario -> compare`

Preserve the same game state, viewport size, player pose, camera orientation, input sequence, and capture moment when comparing iterations. A changed screenshot from a different pose is not before/after evidence.

The parent level-design agent must retain authority over the player journey. Do not delegate “improve the level” without first defining the behavior to change, evidence, scope, and falsifier.

## 2. Authority and capability gate

Before composing mutations, establish all of the following:

- authoritative persisted scene path and current document revision
- whether the live editor session loaded that same document
- whether runtime consumes the target marker/path/volume/meta directly
- visible objects mapped to stable document ids, runtime ids, or catalog ids
- registered marker, volume, and path kinds plus their schemas
- available placeable assets, prefabs, collections, terrain materials, and catalog entries
- whether target changes are scene, asset/catalog, gameplay, UI, or renderer concerns

In the editor agent, begin with `editor_status`, `document_revision` with the document included, `scene_summary`, `list_layers`, `list_assets`, `list_catalogs`, and—when connected to play—`runtime_summary`. Use `runtime_get` for specific visible entities.

Stop instead of mutating when:

- the live document differs from the runtime's persisted scene
- a target position exists only in code or is duplicated between code and scene
- an expected stable id is missing or ambiguous
- a required kind/schema or mutation cannot be expressed
- another human/agent changed the base revision
- the requested fix belongs to model scale/pivot, animation, UI, gameplay rules, or rendering rather than scene authoring

Report the precise ownership or editor capability gap. File the required `[FEATURE]` issue before a code fallback. A scene prompt cannot repair an authority split.

## 3. Evidence packet

Build the editor handoff from observed evidence:

| Field | Required content |
| --- | --- |
| scenario | game state, objective, player pose, camera, input sequence, capture time |
| artifacts | absolute before-capture paths and relevant document/runtime summaries |
| observation | what dominates, hides, contradicts, confuses, delays, or misleads |
| player consequence | the wrong belief/action or missing decision caused by the space |
| hypothesis | one causal spatial change expected to alter that behavior |
| metrics | controller/camera/interaction/encounter measurements with units |
| target ids | existing semantic ids and catalog/runtime links; no guessed ids |
| preserve | working routes, landmarks, content, silhouettes, performance budget, and unrelated user work |
| scope | one spawn, route, zone, encounter, or teaching sequence |
| acceptance | document assertions plus replay, timing, comprehension, and visual thresholds |
| falsifier | observation that means the hypothesis failed |

Distinguish direct observation (“the NPC fills the left half of the spawn frame”) from inference (“the player may assume the NPC is the immediate objective”). Require replay or player evidence for the inference.

## 4. Editor-agent prompt contract

Send this structure to the agent controlling the live editor:

```text
You are authoring <game>/<scene> through the provided JGengine editor tools.
Do not hand-edit JSON or source code. Do not invent unavailable ids, kinds, assets, or metadata.

PLAYER OUTCOME
<observable behavior the revised space must cause>

FIXED REPLAY SCENARIO
<state, spawn/pose, camera, inputs, capture moment, viewport>

EVIDENCE
<capture paths, document/runtime summaries, observations separated from inferences>

SPATIAL HYPOTHESIS
<one causal claim; why these scene changes should alter player behavior>

METRICS AND CONSTRAINTS
<measured movement/camera/interaction/AI values, scope, performance, accessibility>

PRESERVE
<ids, routes, content, authored work, silhouettes, and behavior that must not change>

TARGET SEMANTICS
<existing ids to inspect plus required stable ids/kinds/meta; describe additions semantically>

AUTHORING SEQUENCE
1. Call editor_status, document_revision(includeDocument=true), scene_summary, list_layers,
   list_assets, list_catalogs, and runtime_summary when available.
2. Verify that the live document is authoritative and every target maps to a stable id/runtime consumer.
   If not, stop and return an ownership/capability report without mutation.
3. Focus the camera on the target and inspect its nearby ids, hierarchy, collections, terrain, and runtime entities.
4. Return a concise proposed operation list tied to the hypothesis. Then execute one coherent undoable patch group.
5. Re-read the document revision and target objects. Check reachability, collision space, sightlines,
   spawn safety, reverse travel, encounter reset, and performance implications.
6. Switch to walk/play mode only when safe, exercise the fixed scenario, and report what still requires
   the parent agent's external capture or gameplay verification.

MUTATION RULES
- Use direct setters for existing objects, place_asset for registered assets, and terrain/prefab tools for their domains.
- For structural add/remove operations, use push_document_patch with type=commands and the exact current
  baseRevision. Use validated EditorCommand shapes; never force a revision mismatch.
- Prefer stable semantic ids and one coherent patch over many anonymous props.
- Do not use import_document for ordinary iteration or replace unrelated scene content.
- Keep every edit undoable. On a rejected operation or broken invariant, stop or undo rather than improvising in code.

REQUIRED OPERATIONS
<ordered add/move/remove/retag/terrain operations; state purpose and intended downstream consumer,
but let the editor resolve exact coordinates from inspected scene context and measured constraints>

ACCEPTANCE
<document assertions, play behavior, timing, wayfinding, visual composition, reset/exploit checks>

FALSIFIER
<what observed result means this patch should be undone or revised>

RETURN
- before and after document revisions
- exact successful operations and affected ids
- rejected/skipped operations with reasons
- unresolved non-scene ownership
- document assertions performed
- the exact replay/capture request for the parent agent
```

Do not put speculative coordinates into the brief. Give topology, relative relationships, measured clearances, timing targets, and target semantics. The editor agent inspects the current scene and chooses positions that satisfy them; the parent verifies the result live.

## 5. Mutation policy

Use the narrowest safe editor operation:

| Intent | Preferred operation |
| --- | --- |
| inspect authority/state | `document_revision`, `scene_summary`, `list_layers`, `runtime_summary` |
| inspect target | `get_marker`, `get_volume`, `runtime_get`, `camera_goto`, `hierarchy` |
| move/rotate existing | `set_transform` |
| retag or patch semantics | `set_marker`, `set_volume`, `set_path`, `set_meta` |
| place registered prop | `place_asset` |
| add/remove semantic object | versioned `push_document_patch` with `addMarker`/`addVolume`/`addPath`/`remove` commands |
| repeated authored kit | prefab and collection tools |
| terrain form/material | sculpt/paint/layer tools |
| test an uncertain live pose | runtime override, then `write_back_override` only after validation |
| recover failed hypothesis | `undo` and re-run the fixed scenario |

Never use runtime overrides as completion evidence: they are ephemeral until written back, and write-back is valid only for document-linked entities.

## 6. Verification and iteration

After the editor agent returns:

1. Confirm the persisted document diff contains only intended ids and semantics.
2. Assert the required marker/path/volume/prefab/terrain state.
3. Confirm runtime consumers query those ids rather than copied positions.
4. Replay the identical scenario and capture the identical views.
5. Inspect both images for first-look hierarchy, goal/threat/affordance readability, occlusion, safe footing, and world/UI agreement.
6. Measure the behavioral claim: orientation time, first action/decision, route completion, encounter result, failure/retry, or reverse navigation.
7. Keep, revise, or undo the patch based on the falsifier. Change one causal hypothesis per iteration.

Scene counts prove ownership, tests prove transitions, driven play proves progress, and screenshots prove visible composition. Require all applicable rungs.

## 7. Example: spawn repair

For a spawn capture where an oversized NPC, placeholder prop, and weapon silhouette obscure the destination, do not send “make the spawn prettier.” Send a brief whose outcome is: “within five seconds, a fresh player looks toward the first route, recognizes the NPC as optional/safe, and has clear movement space.”

The editor agent must first resolve the player-spawn marker, NPC runtime/document link, visible prop ids, route id, camera direction, and persisted scene revision. It may then move or regroup authored props, establish a foreground-to-landmark composition, preserve collision clearance, and add semantic onboarding markers only when the runtime consumes them. It must report model-scale or viewmodel defects as asset/rendering work, not fake their repair with arbitrary scene transforms.

If the player/NPC coordinates come from code while nearby props come from the scene, stop: migrate authority before spatial polish. Otherwise the before capture and editor session describe different worlds.
