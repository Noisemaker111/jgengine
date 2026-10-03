import { expect, test } from "bun:test";
import { importEditorDocumentJson } from "@jgengine/core/editor/document";
import { getDocumentLiveSync } from "@jgengine/core/editor/liveSync";

import { decodeEditorBridgeRequest } from "./mcp/rpcRequest";
import { createEditorHost } from "./session";

test("environment RPC rejects atomically and preserves custom palette, fog, removal, and history", () => {
  const host = createEditorHost({ gameId: "environment-probe", layers: undefined });
  try {
    const sync = getDocumentLiveSync()!;
    let publications = 0;
    sync.subscribeDocument(() => { publications++; });
    const before = host.session.getState();
    const decoded = decodeEditorBridgeRequest({ method: "dispatch", command: { type: "setEnvironment", environment: { preset: "dawn" } } });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const rejected = host.api.handle(decoded.request);
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain("$.environment.preset");
    expect(host.session.getState()).toBe(before);
    expect(host.session.canUndo()).toBe(false);
    expect(sync.getRevision()).toBe(0);
    expect(publications).toBe(0);

    const environment = { preset: "day" as const, horizonColor: "#d4cbb5", zenithColor: "#8196ae", sunIntensity: 1.55, ambientIntensity: 0.7, fog: { color: "#c4c7b6", near: 120, far: 370 } };
    expect(host.api.handle({ method: "dispatch", command: { type: "setEnvironment", environment } }).ok).toBe(true);
    const json = (host.api.handle({ method: "export_document" }).result as { json: string }).json;
    expect(importEditorDocumentJson(json).environment).toEqual(environment);
    expect(sync.getRevision()).toBe(1);
    environment.fog.far = 999;
    expect(sync.getDocument().environment?.fog?.far).toBe(370);
    expect(host.api.handle({ method: "dispatch", command: { type: "setEnvironment", environment: undefined } }).ok).toBe(true);
    expect(sync.getDocument()).not.toHaveProperty("environment");
    expect(host.api.handle({ method: "undo" }).ok).toBe(true);
    expect(sync.getDocument().environment?.fog?.far).toBe(370);
    expect(host.api.handle({ method: "redo" }).ok).toBe(true);
    expect(sync.getDocument()).not.toHaveProperty("environment");
    expect(sync.getRevision()).toBe(4);
    expect(publications).toBe(4);
  } finally {
    host.dispose();
  }
});
