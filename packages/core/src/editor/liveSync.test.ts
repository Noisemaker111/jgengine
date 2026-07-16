import { describe, expect, test } from "bun:test";

import { createEmptyEditorDocument, normalizeEditorLayers } from "./document";
import {
  applyDocumentPatch,
  applyRuntimeStateDelta,
  createDocumentLiveSync,
  getDocumentLiveSync,
  installDocumentLiveSync,
  runtimeEntityWriteBackCommand,
  subscribeDocumentLiveSyncInstall,
} from "./liveSync";

describe("applyDocumentPatch", () => {
  test("snapshot replaces the document and bumps revision", () => {
    const base = createEmptyEditorDocument();
    const next = normalizeEditorLayers({
      markers: [{ id: "spawn", kind: "player_spawn", position: { x: 1, y: 0, z: 2 } }],
    });
    const result = applyDocumentPatch(base, 0, {
      type: "snapshot",
      baseRevision: 0,
      document: next,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.revision).toBe(1);
    expect(result.document.markers).toHaveLength(1);
    expect(result.document.markers[0]?.id).toBe("spawn");
  });

  test("rejects baseRevision mismatch unless force", () => {
    const base = createEmptyEditorDocument();
    const rejected = applyDocumentPatch(base, 3, {
      type: "snapshot",
      baseRevision: 2,
      document: base,
    });
    expect(rejected.ok).toBe(false);

    const forced = applyDocumentPatch(
      base,
      3,
      { type: "snapshot", baseRevision: 2, document: base },
      { force: true },
    );
    expect(forced.ok).toBe(true);
    if (!forced.ok) throw new Error(forced.error);
    expect(forced.revision).toBe(4);
  });

  test("commands patch applies setTransform onto a marker", () => {
    const base = normalizeEditorLayers({
      markers: [{ id: "boss", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
    });
    const result = applyDocumentPatch(base, 0, {
      type: "commands",
      baseRevision: 0,
      commands: [{ type: "setTransform", id: "boss", position: { x: 10, y: 0, z: -5 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.document.markers[0]?.position).toEqual({ x: 10, y: 0, z: -5 });
    expect(result.revision).toBe(1);
  });

  test("empty commands patch is rejected", () => {
    const result = applyDocumentPatch(createEmptyEditorDocument(), 0, {
      type: "commands",
      baseRevision: 0,
      commands: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("runtime reverse channel", () => {
  test("applyRuntimeStateDelta upserts, merges tunables, and removes", () => {
    const empty = { seq: 0, entities: {}, tunables: {} };
    const first = applyRuntimeStateDelta(empty, {
      at: 1,
      entities: [{ id: "e1", position: { x: 1, y: 0, z: 0 }, values: { hp: 10 } }],
      tunables: { speed: 2 },
    });
    expect(first.snapshot.seq).toBe(1);
    expect(first.snapshot.entities.e1?.position?.x).toBe(1);
    expect(first.snapshot.tunables.speed).toBe(2);

    const second = applyRuntimeStateDelta(first.snapshot, {
      at: 2,
      entities: [{ id: "e1", values: { hp: 8, shield: 1 } }],
      removeIds: ["missing"],
      tunables: { gravity: 9.8 },
    });
    expect(second.snapshot.entities.e1?.values).toEqual({ hp: 8, shield: 1 });
    expect(second.snapshot.entities.e1?.position?.x).toBe(1);
    expect(second.snapshot.tunables).toEqual({ speed: 2, gravity: 9.8 });

    const third = applyRuntimeStateDelta(second.snapshot, {
      at: 3,
      removeIds: ["e1"],
    });
    expect(third.snapshot.entities.e1).toBeUndefined();
  });

  test("runtimeEntityWriteBackCommand builds setTransform for markers and ignores unknowns", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "boss", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
    });
    const command = runtimeEntityWriteBackCommand(doc, {
      id: "boss",
      position: { x: 3, y: 1, z: 4 },
      rotationY: 1.5,
    });
    expect(command).toEqual({
      type: "setTransform",
      id: "boss",
      position: { x: 3, y: 1, z: 4 },
      rotationY: 1.5,
    });
    expect(runtimeEntityWriteBackCommand(doc, { id: "nope", position: { x: 0, y: 0, z: 0 } })).toBeNull();
    expect(runtimeEntityWriteBackCommand(doc, { id: "boss" })).toBeNull();
  });
});

describe("createDocumentLiveSync", () => {
  test("replaceDocument notifies subscribers and is pullable", () => {
    const sync = createDocumentLiveSync(createEmptyEditorDocument());
    const events: number[] = [];
    sync.subscribeDocument((event) => events.push(event.revision));

    const next = normalizeEditorLayers({
      markers: [{ id: "a", kind: "poi", position: { x: 0, y: 0, z: 0 } }],
    });
    const event = sync.replaceDocument(next);
    expect(event.revision).toBe(1);
    expect(events).toEqual([1]);
    expect(sync.getDocument().markers[0]?.id).toBe("a");
    expect(sync.pullPatches(0)).toHaveLength(1);
    expect(sync.pullPatches(1)).toHaveLength(0);
  });

  test("command patch from matching baseRevision applies; stale base rejects", () => {
    const sync = createDocumentLiveSync(
      normalizeEditorLayers({
        markers: [{ id: "m", kind: "mob", position: { x: 0, y: 0, z: 0 } }],
      }),
    );
    const ok = sync.applyPatch({
      type: "commands",
      baseRevision: 0,
      commands: [{ type: "setTransform", id: "m", position: { x: 9, y: 0, z: 0 } }],
    });
    expect(ok.ok).toBe(true);
    expect(sync.getDocument().markers[0]?.position.x).toBe(9);

    const stale = sync.applyPatch({
      type: "commands",
      baseRevision: 0,
      commands: [{ type: "setTransform", id: "m", position: { x: 1, y: 0, z: 0 } }],
    });
    expect(stale.ok).toBe(false);
    expect(sync.getDocument().markers[0]?.position.x).toBe(9);
  });

  test("runtime overrides stay ephemeral until writeBackOverride", () => {
    const sync = createDocumentLiveSync(
      normalizeEditorLayers({
        markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
      }),
    );
    sync.setRuntimeOverride({ id: "spawn", position: { x: 50, y: 0, z: 50 } });
    expect(sync.getDocument().markers[0]?.position.x).toBe(0);
    expect(sync.getRuntimeOverrides().spawn?.position?.x).toBe(50);

    const written = sync.writeBackOverride("spawn");
    expect(written.ok).toBe(true);
    expect(sync.getDocument().markers[0]?.position.x).toBe(50);
    expect(sync.getRuntimeOverrides().spawn).toBeUndefined();
    expect(sync.getRevision()).toBe(1);
  });

  test("pushRuntimeDelta streams to subscribers and pull buffer", () => {
    const sync = createDocumentLiveSync(createEmptyEditorDocument());
    const seen: number[] = [];
    sync.subscribeRuntime((delta) => seen.push(delta.seq));
    const d1 = sync.pushRuntimeDelta({
      at: 10,
      entities: [{ id: "p1", position: { x: 1, y: 0, z: 1 } }],
    });
    const d2 = sync.pushRuntimeDelta({ at: 11, tunables: { paused: true } });
    expect(d1.seq).toBe(1);
    expect(d2.seq).toBe(2);
    expect(seen).toEqual([1, 2]);
    expect(sync.pullRuntimeDeltas(0)).toHaveLength(2);
    expect(sync.pullRuntimeDeltas(1)).toHaveLength(1);
    expect(sync.getRuntimeState().tunables.paused).toBe(true);
  });

  test("install/get/subscribeDocumentLiveSyncInstall wire the global bus", () => {
    const sync = createDocumentLiveSync(createEmptyEditorDocument());
    let installs = 0;
    const unsub = subscribeDocumentLiveSyncInstall(() => {
      installs += 1;
    });
    const dispose = installDocumentLiveSync(sync);
    expect(getDocumentLiveSync()).toBe(sync);
    expect(installs).toBe(1);
    dispose();
    expect(getDocumentLiveSync()).toBeNull();
    expect(installs).toBe(2);
    unsub();
  });
});
