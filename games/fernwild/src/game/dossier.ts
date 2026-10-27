import { createCodex, type Codex, type CodexSnapshot } from "@jgengine/core/codex/codex";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { isMounted, speciesNear, tames } from "./creatures";
import { ITEMS } from "./data/items";
import { NOTE_XP, NOTES } from "./data/notes";
import { SPECIES } from "./data/species";
import { grantXp } from "./survivor";

/** How close a creature comes before the dossier has it, as ARK's dossier fills when you meet one. */
const SIGHT = 30;
/** How close E reads a note. */
const READ_REACH = 3;
/** Metres south of an obelisk's foot its note lies, clear of the spire's shadow. */
const OBELISK_STEP = 12;
/** Metres out from a cave's mouth its note lies, in the open rather than the dark. */
const CAVE_STEP = 4;
/** Seconds between looks round for new creatures and items. */
const LOOK_EVERY = 0.5;
/** Seconds a read note stays open on the HUD. */
const NOTE_SECONDS = 20;

/** A species met, an item held, a note read, or a species tamed (every one but the bosses can be). */
type Kind = "species" | "item" | "note" | "tame";

/** Where each note lies: at its landmark (a cave's mouth, an obelisk's foot, a summit), all from editor.scene.json. */
export const NOTE_SPOTS: ReadonlyMap<string, readonly [number, number]> = new Map(
  NOTES.flatMap((note): [string, readonly [number, number]][] => {
    const cave = editorLayers.paths.find((path) => path.kind === "cave" && path.id === note.at)?.points;
    const [mouth, inward] = [cave?.[0], cave?.[1]];
    if (mouth !== undefined && inward !== undefined) {
      // Left on the ground just outside the mouth, on the side a survivor walks up from.
      const length = Math.hypot(inward.x - mouth.x, inward.z - mouth.z) || 1;
      return [[note.at, [mouth.x - ((inward.x - mouth.x) / length) * CAVE_STEP, mouth.z - ((inward.z - mouth.z) / length) * CAVE_STEP]]];
    }
    const marker = editorLayers.markers.find((entry) => entry.id === note.at);
    if (marker === undefined) return [];
    return [[note.at, marker.kind === "obelisk" ? [marker.position.x, marker.position.z + OBELISK_STEP] : [marker.position.x, marker.position.z]]];
  }),
);

interface Dossier {
  codex: Codex<{ kind: Kind }>;
  since: number;
  reading: { id: string; at: number } | null;
}

const dossierOf = perContext(
  (ctx: GameContext): Dossier => ({
    codex: createCodex<{ kind: Kind }>({
      now: () => ctx.time.now() * 1000,
      entries: [
        ...Object.values(SPECIES).map((def) => ({ id: `species:${def.id}`, name: def.label, category: "species", meta: { kind: "species" as const } })),
        ...ITEMS.map((item) => ({ id: `item:${item.id}`, name: item.label, category: "item", meta: { kind: "item" as const } })),
        ...NOTES.map((note) => ({ id: `note:${note.at}`, name: note.title, category: "note", description: note.text, meta: { kind: "note" as const } })),
        ...Object.values(SPECIES)
          .filter((def) => def.torporImmune !== true)
          .map((def) => ({ id: `tame:${def.id}`, name: def.label, category: "tame", meta: { kind: "tame" as const } })),
      ],
      onDiscover: (entry) => {
        if (entry.meta?.kind === "species") ctx.game.notices.push({ text: `Dossier: ${entry.name}`, tone: "info" });
      },
    }),
    since: Number.POSITIVE_INFINITY,
    reading: null,
  }),
);

/** The note lying within reach, unread or not, or null. */
function noteInReach(ctx: GameContext): string | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  for (const [id, at] of NOTE_SPOTS) if (Math.hypot(at[0] - me.position[0], at[1] - me.position[2]) <= READ_REACH) return id;
  return null;
}

/** Look round: creatures in sight and items in the bags join the dossier. */
export function tickDossier(ctx: GameContext, dt: number): void {
  const dossier = dossierOf(ctx);
  dossier.since += dt;
  if (dossier.since < LOOK_EVERY) return;
  dossier.since = 0;
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return;
  for (const species of speciesNear(ctx, me.position, SIGHT)) dossier.codex.discover(`species:${species}`);
  for (const tame of tames(ctx)) dossier.codex.discover(`tame:${tame.species}`);
  for (const inventory of [BAG, HOTBAR]) {
    for (const slot of ctx.player.inventory.state(inventory).slots) if (slot !== null) dossier.codex.discover(`item:${slot.itemId}`);
  }
  if (dossier.reading !== null && ctx.time.now() - dossier.reading.at > NOTE_SECONDS) dossier.reading = null;
}

/** E at a note: read it; the first time it gives experience. */
export function readNote(ctx: GameContext): void {
  const id = noteInReach(ctx);
  if (id === null) return;
  const dossier = dossierOf(ctx);
  if (dossier.codex.discover(`note:${id}`) !== null) grantXp(ctx, NOTE_XP);
  dossier.reading = { id, at: ctx.time.now() };
}

export function closeNote(ctx: GameContext): void {
  dossierOf(ctx).reading = null;
}

export function notePrompts(ctx: GameContext): PositionedPrompt[] {
  const id = noteInReach(ctx);
  const at = id === null ? undefined : NOTE_SPOTS.get(id);
  const note = NOTES.find((entry) => entry.at === id);
  if (at === undefined || note === undefined) return [];
  // From the saddle a note already read gives way to E's Dismount.
  if (isMounted(ctx) && dossierOf(ctx).codex.isDiscovered(`note:${note.at}`)) return [];
  return [{ id: `note:${id}`, position: { x: at[0], z: at[1] }, priority: 3, prompt: proximityPrompt({ radius: READ_REACH + 1, display: keybind("interact", `Read ${note.title}`), invoke: command("readNote") }) }];
}

/** The nearest unread note within `within` metres of `from`, on the ground. */
export function nearestUnreadNote(ctx: GameContext, from: readonly [number, number, number], within: number): [number, number, number] | null {
  const codex = dossierOf(ctx).codex;
  let best: [number, number, number] | null = null;
  let bestDistance = within;
  for (const [id, at] of NOTE_SPOTS) {
    if (codex.isDiscovered(`note:${id}`)) continue;
    const distance = Math.hypot(at[0] - from[0], at[1] - from[2]);
    if (distance <= bestDistance) {
      best = [at[0], ctx.world.groundHeightAt(at[0], at[1]), at[1]];
      bestDistance = distance;
    }
  }
  return best;
}

/** How much of each kind the survivor has met, of how many the island holds. */
export function dossierView(ctx: GameContext) {
  const dossier = dossierOf(ctx);
  const count = (kind: Kind) => dossier.codex.list(kind).filter((entry) => entry.discovered).length;
  const reading = dossier.reading === null ? null : NOTES.find((note) => note.at === dossier.reading!.id) ?? null;
  return {
    species: { seen: count("species"), total: dossier.codex.list("species").length },
    items: { seen: count("item"), total: dossier.codex.list("item").length },
    notes: { seen: count("note"), total: dossier.codex.list("note").length },
    tames: { seen: count("tame"), total: dossier.codex.list("tame").length },
    unread: [...NOTE_SPOTS].filter(([id]) => !dossier.codex.isDiscovered(`note:${id}`)).map(([id, at]) => ({ id, at })),
    reading: reading === null ? null : { title: reading.title, text: reading.text },
  };
}

/** The dossier's pages, as ARK's Explorer Notes tab lists them: every species (met or not, tamed or not) and every note (read or not). */
export function dossierPages(ctx: GameContext) {
  const codex = dossierOf(ctx).codex;
  return {
    species: Object.values(SPECIES).map((def) => ({
      id: def.id,
      name: codex.isDiscovered(`species:${def.id}`) ? def.label : "???",
      met: codex.isDiscovered(`species:${def.id}`),
      tamable: def.torporImmune !== true,
      tamed: codex.isDiscovered(`tame:${def.id}`),
    })),
    notes: NOTES.map((note) => ({ id: note.at, title: note.title, text: note.text, read: codex.isDiscovered(`note:${note.at}`) })),
  };
}

/** Whether the dossier has met this species, item, note or tame (`species:dodo`, `item:thatch`, `note:<landmark>`, `tame:dodo`). */
export function inDossier(ctx: GameContext, id: string): boolean {
  return dossierOf(ctx).codex.isDiscovered(id);
}

export function dossierSave(ctx: GameContext) {
  return {
    key: "fernwild.dossier",
    snapshot: (): CodexSnapshot => dossierOf(ctx).codex.snapshot(),
    hydrate: (data: CodexSnapshot) => dossierOf(ctx).codex.restore(data),
  };
}

export function resetDossier(ctx: GameContext): void {
  const dossier = dossierOf(ctx);
  dossier.codex.restore({ discovered: {} });
  dossier.reading = null;
}

/** Every landmark's note for the world overlay: where it lies and whether it has been read. */
export function noteMarks(ctx: GameContext): { id: string; at: readonly [number, number]; read: boolean }[] {
  const codex = dossierOf(ctx).codex;
  return [...NOTE_SPOTS].map(([id, at]) => ({ id, at, read: codex.isDiscovered(`note:${id}`) }));
}
