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


describe("document reconnect recovery", () => {
  test("an evicted cursor catches up once and then accepts incremental commands", () => {
    const doc = normalizeEditorLayers({ markers: [{ id: "m", kind: "poi", position: { x: 0, y: 0, z: 0 } }] });
    const authority = createDocumentLiveSync(doc);
    const replica = createDocumentLiveSync(doc);
    for (let i = 1; i <= 70; i++) {
      expect(authority.applyPatch({ type: "commands", baseRevision: authority.getRevision(),
        commands: [{ type: "setTransform", id: "m", position: { x: i, y: 0, z: 0 } }] }).ok).toBe(true);
    }
    const catchup = authority.pullPatches(replica.getRevision());
    expect(catchup).toHaveLength(1);
    expect(catchup[0]?.type).toBe("snapshot");
    for (const patch of catchup) expect(replica.applyPatch(patch).ok).toBe(true);
    expect(replica.getRevision()).toBe(70);
    expect(replica.getDocument()).toEqual(authority.getDocument());
    const forwarded = replica.pullPatches(69)[0]!;
    expect(forwarded.type).toBe("snapshot");
    expect(forwarded.baseRevision).toBe(69);
    const downstream = applyDocumentPatch(doc, 69, forwarded);
    expect(downstream.ok).toBe(true);
    if (downstream.ok) expect(downstream.revision).toBe(70);
    authority.applyPatch({ type: "commands", baseRevision: 70,
      commands: [{ type: "setTransform", id: "m", position: { x: 71, y: 0, z: 0 } }] });
    for (const patch of authority.pullPatches(replica.getRevision())) expect(replica.applyPatch(patch).ok).toBe(true);
    expect(replica.getRevision()).toBe(71);
    expect(replica.getDocument()).toEqual(authority.getDocument());
  });

  test("the oldest retained base keeps bounded incremental replay", () => {
    const sync = createDocumentLiveSync(createEmptyEditorDocument());
    for (let i = 0; i < 70; i++) sync.replaceDocument(createEmptyEditorDocument());
    expect(sync.pullPatches(6)).toHaveLength(64);
    expect(sync.pullPatches(6)[0]?.revision).toBe(7);
    expect(sync.pullPatches(69)).toHaveLength(1);
    expect(sync.pullPatches(70)).toHaveLength(0);
  });

  test("catch-up snapshots do not alias the authority document", () => {
    const sync = createDocumentLiveSync(normalizeEditorLayers({ markers: [{ id: "m", kind: "poi", position: { x: 0, y: 0, z: 0 } }] }));
    for (let i = 0; i < 70; i++) sync.replaceDocument(sync.getDocument());
    const patch = sync.pullPatches(0)[0]!;
    if (patch.type !== "snapshot") throw new Error("expected snapshot");
    patch.document.markers[0]!.position.x = 999;
    expect(sync.getDocument().markers[0]!.position.x).toBe(0);
  });

  test("rejects corrupt, duplicate and skipped command revisions without committing", () => {
    const sync = createDocumentLiveSync(createEmptyEditorDocument());
    for (const baseRevision of [-1, NaN, Infinity, 0.5]) {
      expect(sync.applyPatch({ type: "snapshot", baseRevision, document: sync.getDocument() }, { force: true }).ok).toBe(false);
    }
    for (const revision of [0, -1, NaN, Infinity, 0.5]) {
      expect(sync.applyPatch({ type: "snapshot", baseRevision: 0, revision, document: sync.getDocument() }).ok).toBe(false);
    }
    expect(sync.applyPatch({ type: "commands", baseRevision: 0, revision: 4,
      commands: [{ type: "clearSelection" }] }).ok).toBe(false);
    expect(sync.getRevision()).toBe(0);
    expect(sync.pullPatches(0)).toEqual([]);
  });
});
