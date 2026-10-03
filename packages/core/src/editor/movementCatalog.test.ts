import { describe, expect, test } from "bun:test";

import { createEditorSession } from "./commands";
import { createEmptyEditorDocument, exportEditorDocumentJson, importEditorDocumentJson } from "./document";
import { bindAuthoredMovement, createAuthoredMovementReader, createMovementSchema, readAuthoredMovement } from "./movementCatalog";
import { parseParams, validateParams } from "../scene/sceneKinds";

describe("authored movement catalogs", () => {
  test("schema exposes only a game's opted-in controls and its own defaults", () => {
    const schema = createMovementSchema({ walkSpeed: 7, gravity: -16, jumpVelocity: 6 });
    expect(schema.fields.map((field) => field.key)).toEqual(["walkSpeed", "gravity", "jumpVelocity"]);
    expect(parseParams(schema, {})).toEqual({ walkSpeed: 7, gravity: -16, jumpVelocity: 6 });
    expect(schema.presets).toBeUndefined();
    expect(validateParams(schema, { walkSpeed: -1 }).some((issue) => issue.key === "walkSpeed")).toBe(true);
    expect(() => createMovementSchema({ groundAcceleration: Infinity })).toThrow("groundAcceleration");
  });

  test("missing or partial authored rows do not invent settings", () => {
    const document = createEmptyEditorDocument();
    expect(readAuthoredMovement(document, "player_motion", "player")).toEqual({ config: {}, diagnostics: [] });
    document.catalogs = [{ id: "player_motion", entries: [{ id: "player", meta: { walkSpeed: 5.8, gravity: -30, groundAcceleration: 9 } }] }];
    expect(readAuthoredMovement(document, "player_motion", "player")).toEqual({
      config: { walkSpeed: 5.8, physics: { gravity: -30 }, movement: { feel: { groundAcceleration: 9 } } }, diagnostics: [],
    });
    expect(readAuthoredMovement(document, "player_motion", "other").config).toEqual({});
  });

  test("maps responsive controls without swallowing valid zeros or game rules", () => {
    const document = createEmptyEditorDocument();
    document.catalogs = [{ id: "actor", entries: [{ id: "hero", meta: {
      walkSpeed: 0, gravity: 0, jumpVelocity: 0, stepHeight: 0.35,
      groundAcceleration: 20, airAcceleration: 0, groundFriction: 8, runMultiplier: 3, crouchMultiplier: 0.3,
      staminaCost: 17,
    } }] }];
    expect(readAuthoredMovement(document, "actor", "hero")).toEqual({
      config: { walkSpeed: 0, physics: { gravity: 0, jumpVelocity: 0 }, movement: { stepHeight: 0.35, feel: { groundAcceleration: 20, airAcceleration: 0, groundFriction: 8, runMultiplier: 3, crouchMultiplier: 0.3 } } }, diagnostics: [],
    });
  });

  test("invalid persisted numbers have located repairs and never replace defaults with zero", () => {
    const document = createEmptyEditorDocument();
    document.catalogs = [{ id: "motion", entries: [{ id: "hero", meta: { walkSpeed: "fast", gravity: Infinity, jumpVelocity: -1, stepHeight: 0.4 } }] }];
    const result = readAuthoredMovement(document, "motion", "hero");
    expect(result.config).toEqual({ movement: { stepHeight: 0.4 } });
    expect(result.diagnostics.map((issue) => issue.path)).toEqual([
      "catalogs[0].entries[0].meta.walkSpeed", "catalogs[0].entries[0].meta.gravity", "catalogs[0].entries[0].meta.jumpVelocity",
    ]);
    expect(result.diagnostics.every((issue) => issue.repair.includes("inherit the game setting"))).toBe(true);
  });

  test("immutable document changes refresh tuning; unchanged frames do no catalog scans", () => {
    let document = createEmptyEditorDocument();
    document.catalogs = [{ id: "motion", entries: [{ id: "hero", meta: { walkSpeed: 3 } }] }];
    let catalogReads = 0;
    let current = { get catalogs() { catalogReads++; return document.catalogs; } };
    const read = createAuthoredMovementReader(() => current, "motion", "hero");
    const first = read();
    const initialReads = catalogReads;
    let latest = first;
    for (let frame = 0; frame < 1000; frame++) latest = read();
    expect(latest).toBe(first);
    expect(catalogReads).toBe(initialReads);
    document = { ...document, catalogs: [{ id: "motion", entries: [{ id: "hero", meta: { walkSpeed: 8 } }] }] };
    current = { get catalogs() { catalogReads++; return document.catalogs; } };
    expect(read().config.walkSpeed).toBe(8);
    expect(catalogReads).toBeGreaterThan(initialReads);
  });

  test("ordinary scene commands, undo/redo and saved reload preserve distinct tuning", () => {
    const schema = createMovementSchema({ walkSpeed: 5.8, gravity: -30, jumpVelocity: 8.4, groundAcceleration: 26, stepHeight: 0.4 });
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "addCatalog", id: "player_motion", schema });
    session.dispatch({ type: "addCatalogEntry", catalogId: "player_motion", entry: { id: "reactor_hunter", meta: { walkSpeed: 5.8, gravity: -30, jumpVelocity: 8.4 } } });
    const read = createAuthoredMovementReader(() => session.getState().document, "player_motion", "reactor_hunter");
    session.dispatch({ type: "setCatalogEntry", catalogId: "player_motion", entryId: "reactor_hunter", patch: { meta: { walkSpeed: 6.2, gravity: -30, jumpVelocity: 8.4, groundAcceleration: 12, stepHeight: 0.25 } } });
    expect(read().config.walkSpeed).toBe(6.2);
    expect(read().config.movement?.feel?.groundAcceleration).toBe(12);
    session.dispatch({ type: "undo" });
    expect(read().config.walkSpeed).toBe(5.8);
    session.dispatch({ type: "redo" });
    const restored = importEditorDocumentJson(exportEditorDocumentJson(session.getState().document));
    expect(readAuthoredMovement(restored, "player_motion", "reactor_hunter")).toEqual(read());
    expect(restored.catalogs[0]!.schema).toEqual(schema);
  });

  test("stable live binding preserves game policy and refreshes numeric tuning after authoring", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    const beforeCommit = () => [1, 2, 3] as const;
    const canSprint = () => false;
    const read = createAuthoredMovementReader(() => session.getState().document, "motion", "player");
    const binding = bindAuthoredMovement(read, { movement: { beforeCommit, canSprint, collideObjects: true, stepHeight: 0.4, feel: { groundAcceleration: 26, airAcceleration: 12 } }, physics: { gravity: -30, jumpVelocity: 8.4, projectileObstacles: true } });
    const movement = binding.movement;
    const physics = binding.physics;
    expect(movement.beforeCommit).toBe(beforeCommit);
    expect(movement.canSprint).toBe(canSprint);
    expect(movement.collideObjects).toBe(true);
    expect(physics.projectileObstacles).toBe(true);
    expect(physics.gravity).toBe(-30);
    expect(movement.feel?.groundAcceleration).toBe(26);
    session.dispatch({ type: "addCatalog", id: "motion", schema: createMovementSchema({ gravity: -30, groundAcceleration: 26, stepHeight: 0.4 }) });
    session.dispatch({ type: "addCatalogEntry", catalogId: "motion", entry: { id: "player", meta: { gravity: -16, groundAcceleration: 8, stepHeight: 0.25 } } });
    expect(binding.movement).toBe(movement);
    expect(binding.physics).toBe(physics);
    expect(physics.gravity).toBe(-16);
    expect(physics.jumpVelocity).toBe(8.4);
    expect(movement.stepHeight).toBe(0.25);
    expect(movement.feel).toEqual({ groundAcceleration: 8, airAcceleration: 12 });
    expect(movement.feel).toBe(movement.feel);
    expect(movement.beforeCommit).toBe(beforeCommit);
    expect(binding.diagnostics).toEqual([]);
    session.dispatch({ type: "undo" });
    expect(physics.gravity).toBe(-30);
    expect(movement.feel).toEqual({ groundAcceleration: 26, airAcceleration: 12 });
  });

  test("climb grade is an opted-in live control retaining the game's height sampler", () => {
    expect(createMovementSchema({ walkSpeed: 3 }).fields.some((field) => field.key === "maxClimbGrade")).toBe(false);
    const schema = createMovementSchema({ maxClimbGrade: 0.85 });
    expect(schema.fields.map((field) => field.key)).toEqual(["maxClimbGrade"]);
    const session = createEditorSession(createEmptyEditorDocument());
    const sample = (x: number, z: number) => x + z;
    const read = createAuthoredMovementReader(() => session.getState().document, "motion", "player");
    const binding = bindAuthoredMovement(read, { movement: { maxClimbGrade: 0.85, climbGradeHeight: sample } });
    expect(binding.movement.maxClimbGrade).toBe(0.85);
    session.dispatch({ type: "addCatalog", id: "motion", schema });
    session.dispatch({ type: "addCatalogEntry", catalogId: "motion", entry: { id: "player", meta: { maxClimbGrade: 0 } } });
    expect(binding.movement.maxClimbGrade).toBe(0);
    expect(binding.movement.climbGradeHeight).toBe(sample);
    session.dispatch({ type: "setCatalogEntry", catalogId: "motion", entryId: "player", patch: { meta: { maxClimbGrade: 0.5 } } });
    expect(binding.movement.maxClimbGrade).toBe(0.5);
    const restored = importEditorDocumentJson(exportEditorDocumentJson(session.getState().document));
    expect(readAuthoredMovement(restored, "motion", "player").config.movement?.maxClimbGrade).toBe(0.5);
    restored.catalogs[0]!.entries[0]!.meta = { maxClimbGrade: -1 };
    expect(readAuthoredMovement(restored, "motion", "player").config.movement?.maxClimbGrade).toBeUndefined();
    expect(readAuthoredMovement(restored, "motion", "player").diagnostics[0]!.path).toContain("meta.maxClimbGrade");
  });
});
