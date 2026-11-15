/**
 * A game's set of authored scene documents (maps, levels, districts) and which one is live. A game
 * that ships more than one `editor.scene.json`-style document declares them here once: each scene
 * names its document, the file it lives in under the game's `src/` (so the editor CLI can load and
 * save it with `--scene`), and a label. `select` switches the live scene and notifies subscribers;
 * the shell answers by rebuilding the game for that scene (`withSceneSet`), so the scene, its terrain
 * and everything the game derives from the document come up fresh without a page reload.
 *
 * Pure model: no rendering, browser or storage dependency. Persistence is injected.
 *
 * @capability scene-set several authored scene documents per game with a live, switchable active scene
 */

export interface SceneSetEntry<TDocument = unknown> {
  /** Shown in a map picker. */
  label: string;
  /** The authored document (raw JSON is fine; the game normalizes it). */
  document: TDocument;
  /** The document's file name under the game's `src/`, e.g. `"editor.scene.json"`. */
  file: string;
}

/** Where the last choice is remembered between sessions (a browser's storage, a URL, a test map). */
export interface SceneSetStorage<Id extends string> {
  read(): string | null;
  write(id: Id): void;
}

export interface SceneSet<Id extends string = string, TDocument = unknown> {
  readonly ids: readonly Id[];
  readonly defaultId: Id;
  entry(id: Id): SceneSetEntry<TDocument>;
  /** The live scene. */
  active(): Id;
  /** Make `id` the live scene. Returns false (and changes nothing) for the live scene or an unknown id. */
  select(id: string): boolean;
  /** Called after every switch. Returns an unsubscribe. */
  subscribe(listener: (id: Id) => void): () => void;
  /** The scene after `id` in declaration order, wrapping round: a "next map" button. */
  next(id?: Id): Id;
  /** Whether a value names one of the set's scenes. */
  has(id: unknown): id is Id;
}

export interface SceneSetOptions<Id extends string, TDocument> {
  scenes: Readonly<Record<Id, SceneSetEntry<TDocument>>>;
  defaultId: Id;
  /** Scene to start on; else the storage's remembered pick; else `defaultId`. Unknown ids are ignored. */
  initial?: string | null;
  storage?: SceneSetStorage<Id>;
}

export function createSceneSet<Id extends string, TDocument = unknown>(options: SceneSetOptions<Id, TDocument>): SceneSet<Id, TDocument> {
  const ids = Object.keys(options.scenes) as Id[];
  if (ids.length === 0) throw new Error("createSceneSet: a scene set needs at least one scene");
  if (!ids.includes(options.defaultId)) throw new Error(`createSceneSet: default scene "${options.defaultId}" is not in the set`);
  const has = (id: unknown): id is Id => typeof id === "string" && (ids as string[]).includes(id);
  let stored: string | null = null;
  try {
    stored = options.storage?.read() ?? null;
  } catch {
    stored = null;
  }
  let active: Id = has(options.initial) ? options.initial : has(stored) ? stored : options.defaultId;
  const listeners = new Set<(id: Id) => void>();
  return {
    ids,
    defaultId: options.defaultId,
    entry: (id) => options.scenes[id],
    active: () => active,
    has,
    next(id = active) {
      return ids[(ids.indexOf(id) + 1) % ids.length]!;
    },
    select(id) {
      if (!has(id) || id === active) return false;
      active = id;
      try {
        options.storage?.write(id);
      } catch {
        // A blocked storage only loses the memory of the pick, never the switch itself.
      }
      for (const listener of [...listeners]) listener(id);
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A playable that can rebuild itself for each scene of a set: what the shell switches between. */
export interface PlayableSceneSwitch<TPlayable> {
  set: SceneSet;
  /** Build the playable for one scene. Called when the scene becomes live; the shell remounts on it. */
  build(id: string): TPlayable;
}

/**
 * Attach a scene set to a playable game: the shell mounts `build(set.active())` and, whenever
 * `set.select` switches, remounts with `build(id)`. Returns the playable for the live scene, carrying
 * the switch under `scenes`.
 */
export function withSceneSet<TPlayable extends object>(set: SceneSet, build: (id: string) => TPlayable): TPlayable & { scenes: PlayableSceneSwitch<TPlayable> } {
  return Object.assign(build(set.active()), { scenes: { set, build } });
}
