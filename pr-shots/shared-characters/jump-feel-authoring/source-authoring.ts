import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEditorSession } from "../../../../packages/core/src/editor/commands";
import { exportEditorDocumentJson, importEditorDocumentJson } from "../../../../packages/core/src/editor/document";
import { bindAuthoredMovement, createAuthoredMovementReader, createMovementSchema, readAuthoredMovement } from "../../../../packages/core/src/editor/movementCatalog";
import { measureMovement } from "../../../../packages/core/src/movement/movementProbe";
import { resolvePlayerMovementTuning } from "../../../../packages/core/src/movement/playerMovement";

const originalPath = "/workspace/JGengine-games/scrap-signal/src/editor.scene.json";
const originalText = readFileSync(originalPath, "utf8");
const originalHash = createHash("sha256").update(originalText).digest("hex");
const original = importEditorDocumentJson(originalText);
const session = createEditorSession(original);
const catalogId = "player-motion", entryId = "reactor_hunter";
const existing = { walkSpeed: 5.8, gravity: -30, jumpVelocity: 8.4, collisionHeight: 1.8 };
const jumpFeel = { jumpBufferMs: 0, coyoteMs: 0, jumpCutFactor: 1, apexGravityScale: 1, apexSpeed: 1.5, fallGravityScale: 1, landingRecoveryMs: 0, landingSpeedScale: 0.5 };
const defaults = { ...existing, ...jumpFeel };
const schema = createMovementSchema(defaults);
session.dispatch({ type: "addCatalog", id: catalogId, schema });
session.dispatch({ type: "addCatalogEntry", catalogId, entry: { id: entryId, meta: defaults } });
const read = createAuthoredMovementReader(() => session.getState().document, catalogId, entryId);
const binding = bindAuthoredMovement(read, { physics: { gravity: -30, jumpVelocity: 8.4, projectileObstacles: true } });
const tuning = resolvePlayerMovementTuning({ movement: binding.movement, physics: binding.physics });
assert.deepEqual(binding.movement.feel, jumpFeel);
const baseline = measureMovement({ movement: binding.movement, physics: binding.physics, walkSpeed: read().config.walkSpeed });
const edited = { ...jumpFeel, jumpCutFactor: 0.2, landingRecoveryMs: 600, landingSpeedScale: 0.1 };
session.dispatch({ type: "setCatalogEntry", catalogId, entryId, patch: { meta: { ...existing, ...edited } } });
assert.deepEqual(binding.movement.feel, edited);
assert.equal(tuning.physics?.jumpCutFactor, 0.2);
assert.equal(tuning.physics?.landingRecoveryMs, 600);
const adjusted = measureMovement({ movement: binding.movement, physics: binding.physics, walkSpeed: read().config.walkSpeed });
assert.ok(adjusted.tapJumpHeight < baseline.tapJumpHeight);
session.dispatch({ type: "undo" });
assert.deepEqual(binding.movement.feel, jumpFeel);
session.dispatch({ type: "redo" });
assert.deepEqual(binding.movement.feel, edited);
const saved = exportEditorDocumentJson(session.getState().document);
const restored = importEditorDocumentJson(saved);
const restoredRead = createAuthoredMovementReader(() => restored, catalogId, entryId);
assert.deepEqual(restoredRead().config.movement?.feel, edited);
assert.deepEqual({ ...restored, catalogs: original.catalogs }, original);
assert.equal(createHash("sha256").update(readFileSync(originalPath, "utf8")).digest("hex"), originalHash);
const corrupt = structuredClone(restored);
corrupt.catalogs[0]!.entries[0]!.meta!.jumpCutFactor = 1.1;
const rejected = readAuthoredMovement(corrupt, catalogId, entryId);
assert.equal(rejected.config.movement?.feel?.jumpCutFactor, undefined);
assert.equal(rejected.diagnostics[0]?.path, "catalogs[0].entries[0].meta.jumpCutFactor");
await Bun.write(resolve(import.meta.dir, "source-authoring-doc.json"), saved);
await Bun.write(resolve(import.meta.dir, "source-authoring-result.json"), JSON.stringify({
  layer: "engine source full original Scrap document configuration and pure shared movement probe; actual game and native appearance proof separate",
  originalPath, originalHash, markerCount: original.markers.length, catalogId, entryId,
  schemaGroup: schema.groups?.find(group => group.id === "jump-response"),
  optedFields: schema.fields.filter(field => field.group === "jump-response").map(field => field.key),
  inspected: { defaults: jumpFeel, edited, reloaded: restoredRead().config.movement?.feel },
  probe: { baselineTapJumpHeight: baseline.tapJumpHeight, adjustedTapJumpHeight: adjusted.tapJumpHeight },
  invalidSavedDiagnostic: rejected.diagnostics[0], fullSceneOutsideCatalogUnchanged: true,
}, null, 2) + "\n");
console.log("Source full original Scrap document: jump controls edit/live/inspect/undo/save/reload PASS");
