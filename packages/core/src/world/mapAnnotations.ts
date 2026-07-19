import type { WorldXZ } from "./minimap";
import type { MapLayerTone, MapRoute, MapZone, MapZoneShape } from "./mapLayers";

/** A freehand drawn line on the map — a world-XZ polyline. */
export interface MapStroke {
  id: string;
  points: readonly WorldXZ[];
  tone?: MapLayerTone;
  /** Line width in map pixels. */
  width?: number;
}

/** A drawn area annotation (circle/rect/polygon), reusing the map-zone shape vocabulary. */
export interface MapShapeAnnotation {
  id: string;
  shape: MapZoneShape;
  tone?: MapLayerTone;
  label?: string;
}

/** A text note pinned at a world point. */
export interface MapNote {
  id: string;
  position: WorldXZ;
  text: string;
  tone?: MapLayerTone;
}

/** Whole serializable state of an annotation layer — drop into a save blob. */
export interface AnnotationSnapshot {
  strokes: readonly MapStroke[];
  shapes: readonly MapShapeAnnotation[];
  notes: readonly MapNote[];
}

/** Player-drawn map annotation layer — strokes, shapes, and notes over caller-owned map data. */
export interface AnnotationLayer {
  /** Add a freehand stroke; returns its id. Ignored (returns "") when fewer than 2 points. */
  addStroke(points: readonly WorldXZ[], options?: { id?: string; tone?: MapLayerTone; width?: number }): string;
  addShape(shape: MapZoneShape, options?: { id?: string; tone?: MapLayerTone; label?: string }): string;
  addNote(position: WorldXZ, text: string, options?: { id?: string; tone?: MapLayerTone }): string;
  remove(id: string): boolean;
  clear(): void;
  strokes(): readonly MapStroke[];
  shapes(): readonly MapShapeAnnotation[];
  notes(): readonly MapNote[];
  /** Project strokes into `MapRoute`s for a map's `routes` prop. Stable identity between changes. */
  routes(): readonly MapRoute[];
  /** Project shapes into `MapZone`s for a map's `zones` prop. Stable identity between changes. */
  zones(): readonly MapZone[];
  subscribe(listener: () => void): () => void;
  snapshot(): AnnotationSnapshot;
  restore(snapshot: AnnotationSnapshot): void;
}

/** Options for {@link createAnnotationLayer}. */
export interface AnnotationLayerOptions {
  /** Default tone applied to strokes/shapes/notes added without an explicit one. Default `"info"`. */
  defaultTone?: MapLayerTone;
}

/**
 * Player-drawn map annotation layer: freehand `strokes`, area `shapes`, and
 * pinned `notes`, all world-XZ and serializable. `routes()`/`zones()` project
 * strokes/shapes into the exact shapes `Minimap`/`WorldMap`/`FullscreenMap`
 * already render via their `routes`/`zones` props, so drawing needs no new
 * renderer. State is plain data; `snapshot`/`restore` round-trip through a save.
 *
 * @capability map-annotations player-drawn map annotation layer — freehand strokes, area shapes, and pinned notes, projected into the map's routes/zones props and serializable
 */
export function createAnnotationLayer(options: AnnotationLayerOptions = {}): AnnotationLayer {
  const defaultTone = options.defaultTone ?? "info";
  const strokeStore = new Map<string, MapStroke>();
  const shapeStore = new Map<string, MapShapeAnnotation>();
  const noteStore = new Map<string, MapNote>();
  const listeners = new Set<() => void>();
  let counter = 0;
  let strokeCache: readonly MapStroke[] | null = null;
  let shapeCache: readonly MapShapeAnnotation[] | null = null;
  let noteCache: readonly MapNote[] | null = null;
  let routeCache: readonly MapRoute[] | null = null;
  let zoneCache: readonly MapZone[] | null = null;

  function invalidate(): void {
    strokeCache = null;
    shapeCache = null;
    noteCache = null;
    routeCache = null;
    zoneCache = null;
    for (const listener of listeners) listener();
  }

  function generateId(): string {
    let id = `annotation-${counter}`;
    while (strokeStore.has(id) || shapeStore.has(id) || noteStore.has(id)) {
      counter += 1;
      id = `annotation-${counter}`;
    }
    counter += 1;
    return id;
  }

  const layer: AnnotationLayer = {
    addStroke(points, opts = {}) {
      if (points.length < 2) return "";
      const id = opts.id ?? generateId();
      const stroke: MapStroke = {
        id,
        points: points.map((p) => [p[0], p[1]] as WorldXZ),
        tone: opts.tone ?? defaultTone,
        ...(opts.width !== undefined ? { width: opts.width } : {}),
      };
      strokeStore.set(id, stroke);
      invalidate();
      return id;
    },
    addShape(shape, opts = {}) {
      const id = opts.id ?? generateId();
      shapeStore.set(id, { id, shape, tone: opts.tone ?? defaultTone, ...(opts.label !== undefined ? { label: opts.label } : {}) });
      invalidate();
      return id;
    },
    addNote(position, text, opts = {}) {
      const id = opts.id ?? generateId();
      noteStore.set(id, { id, position: [position[0], position[1]], text, tone: opts.tone ?? defaultTone });
      invalidate();
      return id;
    },
    remove(id) {
      const existed = strokeStore.delete(id) || shapeStore.delete(id) || noteStore.delete(id);
      if (existed) invalidate();
      return existed;
    },
    clear() {
      if (strokeStore.size === 0 && shapeStore.size === 0 && noteStore.size === 0) return;
      strokeStore.clear();
      shapeStore.clear();
      noteStore.clear();
      invalidate();
    },
    strokes() {
      if (strokeCache === null) strokeCache = [...strokeStore.values()];
      return strokeCache;
    },
    shapes() {
      if (shapeCache === null) shapeCache = [...shapeStore.values()];
      return shapeCache;
    },
    notes() {
      if (noteCache === null) noteCache = [...noteStore.values()];
      return noteCache;
    },
    routes() {
      if (routeCache === null) {
        routeCache = layer.strokes().map((stroke) => ({
          id: stroke.id,
          points: stroke.points,
          ...(stroke.tone !== undefined ? { tone: stroke.tone } : {}),
          ...(stroke.width !== undefined ? { width: stroke.width } : {}),
        }));
      }
      return routeCache;
    },
    zones() {
      if (zoneCache === null) {
        zoneCache = layer.shapes().map((annotation) => ({
          id: annotation.id,
          shape: annotation.shape,
          ...(annotation.tone !== undefined ? { tone: annotation.tone } : {}),
          ...(annotation.label !== undefined ? { label: annotation.label } : {}),
        }));
      }
      return zoneCache;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { strokes: layer.strokes(), shapes: layer.shapes(), notes: layer.notes() };
    },
    restore(snapshot) {
      strokeStore.clear();
      shapeStore.clear();
      noteStore.clear();
      for (const stroke of snapshot.strokes) strokeStore.set(stroke.id, stroke);
      for (const shape of snapshot.shapes) shapeStore.set(shape.id, shape);
      for (const note of snapshot.notes) noteStore.set(note.id, note);
      invalidate();
    },
  };

  return layer;
}
