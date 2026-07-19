import type { AnnotationLayer } from "./mapAnnotations";
import type { MapLayerTone, MapZoneShape } from "./mapLayers";
import type { WorldXZ } from "./minimap";

/** Feed action shared drawings ride by default (pair with the party feed, like pings). */
export const ANNOTATION_FEED_ACTION = "map.annotation";

/** A serializable map-annotation edit broadcast to other players. */
export type AnnotationBroadcast =
  | { op: "stroke"; from: string; id: string; points: readonly WorldXZ[]; tone?: MapLayerTone; width?: number }
  | { op: "shape"; from: string; id: string; shape: MapZoneShape; tone?: MapLayerTone; label?: string }
  | { op: "note"; from: string; id: string; position: WorldXZ; text: string; tone?: MapLayerTone }
  | { op: "remove"; from: string; id: string }
  | { op: "clear"; from: string };

/** The feed sink shared annotations push to — an alias of the ping/feed `push` seam. */
export interface AnnotationFeedSink {
  push(action: string, entry: unknown): void;
}

/** Construction options for {@link createSharedAnnotations}. */
export interface SharedAnnotationsDeps {
  /** The local annotation layer edits apply to (and inbound edits mirror into). */
  layer: AnnotationLayer;
  /** Feed to broadcast local edits on (typically `ctx.game.feed`). */
  feed: AnnotationFeedSink;
  /** This player's id — stamped on broadcasts and used to drop our own echoes. */
  from: string;
  /** Feed action to publish/consume. Default {@link ANNOTATION_FEED_ACTION}. */
  action?: string;
}

/**
 * Local annotation edits that also broadcast, plus `apply` for inbound edits.
 * `add*`/`remove`/`clear` mirror {@link AnnotationLayer} but return globally-unique
 * ids so two clients never collide.
 */
export interface SharedAnnotations {
  addStroke(points: readonly WorldXZ[], options?: { tone?: MapLayerTone; width?: number }): string;
  addShape(shape: MapZoneShape, options?: { tone?: MapLayerTone; label?: string }): string;
  addNote(position: WorldXZ, text: string, options?: { tone?: MapLayerTone }): string;
  remove(id: string): boolean;
  clear(): void;
  /** Mirror an inbound broadcast from another player; own echoes (matching `from`) are ignored. */
  apply(payload: AnnotationBroadcast): void;
  feedAction: string;
}

/**
 * Make a map annotation layer collaborative: local `addStroke`/`addShape`/
 * `addNote`/`remove`/`clear` apply then broadcast a serializable edit over the
 * party feed (the same seam `createPingSystem` uses), and `apply` mirrors inbound
 * edits from other players — dropping our own echoes. Ids are globally unique per
 * client so two players' strokes never collide. Transport-agnostic: wire `feed`
 * to any replicated feed and route received entries into `apply`.
 *
 * @capability shared-annotations broadcast local map-drawing edits over the party feed and mirror inbound edits — collaborative annotations over any replicated feed
 */
export function createSharedAnnotations(deps: SharedAnnotationsDeps): SharedAnnotations {
  const { layer, feed, from } = deps;
  const action = deps.action ?? ANNOTATION_FEED_ACTION;
  let counter = 0;

  function nextId(): string {
    counter += 1;
    return `${from}:${counter}`;
  }

  function broadcast(payload: AnnotationBroadcast): void {
    feed.push(action, payload);
  }

  return {
    feedAction: action,
    addStroke(points, options = {}) {
      const id = nextId();
      layer.addStroke(points, { id, ...options });
      broadcast({ op: "stroke", from, id, points: points.map((p) => [p[0], p[1]] as WorldXZ), ...options });
      return id;
    },
    addShape(shape, options = {}) {
      const id = nextId();
      layer.addShape(shape, { id, ...options });
      broadcast({ op: "shape", from, id, shape, ...options });
      return id;
    },
    addNote(position, text, options = {}) {
      const id = nextId();
      layer.addNote(position, text, { id, ...options });
      broadcast({ op: "note", from, id, position: [position[0], position[1]], text, ...options });
      return id;
    },
    remove(id) {
      const existed = layer.remove(id);
      if (existed) broadcast({ op: "remove", from, id });
      return existed;
    },
    clear() {
      layer.clear();
      broadcast({ op: "clear", from });
    },
    apply(payload) {
      if (payload.from === from) return; // ignore our own echo
      switch (payload.op) {
        case "stroke":
          layer.addStroke(payload.points, { id: payload.id, tone: payload.tone, width: payload.width });
          return;
        case "shape":
          layer.addShape(payload.shape, { id: payload.id, tone: payload.tone, label: payload.label });
          return;
        case "note":
          layer.addNote(payload.position, payload.text, { id: payload.id, tone: payload.tone });
          return;
        case "remove":
          layer.remove(payload.id);
          return;
        case "clear":
          layer.clear();
          return;
      }
    },
  };
}
