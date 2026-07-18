import { describe, expect, test } from "bun:test";

import { decodeAssetDragPayload, encodeAssetDragPayload } from "./AssetBrowser";

describe("asset drag payload", () => {
  test("round-trips placeable entries", () => {
    const entry = { id: "crate", label: "Crate", kind: "model" as const };
    expect(decodeAssetDragPayload(encodeAssetDragPayload(entry))).toEqual(entry);
  });

  test("rejects malformed payloads", () => {
    expect(decodeAssetDragPayload("")).toBeNull();
    expect(decodeAssetDragPayload("{")).toBeNull();
    expect(decodeAssetDragPayload(JSON.stringify({ id: "x" }))).toBeNull();
    expect(decodeAssetDragPayload(JSON.stringify({ id: "x", label: "X", kind: "nope" }))).toBeNull();
  });
});
