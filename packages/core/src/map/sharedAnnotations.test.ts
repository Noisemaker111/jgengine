import { describe, expect, test } from "bun:test";

import { createAnnotationLayer } from "./mapAnnotations";
import { ANNOTATION_FEED_ACTION, createSharedAnnotations, type AnnotationBroadcast } from "./sharedAnnotations";

/** A tiny in-process feed bus that fans every push out to subscribed clients — stands in for a replicated feed. */
function bus() {
  const sinks: ((payload: AnnotationBroadcast) => void)[] = [];
  return {
    sink: {
      push(action: string, entry: unknown) {
        if (action !== ANNOTATION_FEED_ACTION) return;
        for (const receive of sinks) receive(entry as AnnotationBroadcast);
      },
    },
    subscribe(receive: (payload: AnnotationBroadcast) => void) {
      sinks.push(receive);
    },
  };
}

/** Two clients (A and B) sharing one bus, each mirroring inbound edits into its own layer. */
function twoClients() {
  const channel = bus();
  const layerA = createAnnotationLayer();
  const layerB = createAnnotationLayer();
  const a = createSharedAnnotations({ layer: layerA, feed: channel.sink, from: "A" });
  const b = createSharedAnnotations({ layer: layerB, feed: channel.sink, from: "B" });
  channel.subscribe((payload) => { a.apply(payload); b.apply(payload); });
  return { a, b, layerA, layerB };
}

describe("createSharedAnnotations", () => {
  test("A's stroke appears on B (and not duplicated on A)", () => {
    const { a, layerA, layerB } = twoClients();
    const id = a.addStroke([[0, 0], [4, 2]], { tone: "danger" });
    expect(id).toBe("A:1"); // globally-unique, owner-prefixed
    expect(layerA.strokes()).toHaveLength(1); // applied locally, echo ignored
    expect(layerB.strokes()).toHaveLength(1); // mirrored on the other client
    expect(layerB.routes()[0]).toMatchObject({ id: "A:1", tone: "danger" });
  });

  test("both clients converge when each draws", () => {
    const { a, b, layerA, layerB } = twoClients();
    a.addStroke([[0, 0], [1, 1]]);
    b.addShape({ kind: "circle", center: [2, 2], radius: 3 });
    b.addNote([5, 5], "cache");
    expect(layerA.strokes()).toHaveLength(1);
    expect(layerA.zones()).toHaveLength(1);
    expect(layerA.notes()[0]?.text).toBe("cache");
    expect(layerB.strokes()).toHaveLength(1);
    expect(layerB.zones()).toHaveLength(1);
  });

  test("remove and clear propagate", () => {
    const { a, b, layerA, layerB } = twoClients();
    const id = a.addStroke([[0, 0], [1, 1]]);
    expect(layerB.strokes()).toHaveLength(1);
    a.remove(id);
    expect(layerB.strokes()).toHaveLength(0);
    b.addStroke([[2, 2], [3, 3]]);
    a.clear();
    expect(layerA.strokes()).toHaveLength(0);
    expect(layerB.strokes()).toHaveLength(0);
  });

  test("apply ignores our own echo (no double-apply)", () => {
    const layer = createAnnotationLayer();
    const shared = createSharedAnnotations({ layer, feed: { push: () => {} }, from: "A" });
    const id = shared.addStroke([[0, 0], [1, 1]]);
    shared.apply({ op: "stroke", from: "A", id, points: [[0, 0], [1, 1]] });
    expect(layer.strokes()).toHaveLength(1); // still one, own echo dropped
  });
});
