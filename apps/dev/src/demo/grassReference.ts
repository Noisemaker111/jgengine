/**
 * The grass reference boards: real photos paired with a grass species and a camera that frames it
 * the same way, the game views every grass change is judged on, and the written targets for the
 * cartoon and animated ends of the style range. The `grass-reference` demo draws the patches and
 * `bun run shoot --board grass` shoots them beside the photos.
 */

/** A real photo the board puts beside our matching view. */
export interface GrassReferencePhoto {
  /** Board row id; the demo's capture view is `ref-<id>`. */
  id: string;
  /** File under `scripts/reference/grass/photos/`. */
  file: string;
  /** Species the matching patch grows. */
  species: string;
  /** What the photo shows, in a few words. */
  subject: string;
  /** Camera height above the ground, metres. */
  height: number;
  /** Camera pitch below the horizon, degrees. */
  pitch: number;
  credit: { author: string; license: string; source: string };
}

/** Every reference photo, in board order. Credits are repeated in CREDITS.md. */
export const GRASS_REFERENCE_PHOTOS: readonly GrassReferencePhoto[] = [
  {
    id: "lawn-frog",
    file: "lawn-frog.jpg",
    species: "lawn",
    subject: "mown lawn from a frog's eye",
    height: 0.07,
    pitch: 14,
    credit: { author: "carrotmadman6 from Mauritius", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:The_lawn_from_the_sight_of_a_frog_(4440182483).jpg" },
  },
  {
    id: "pasture",
    file: "pasture.jpg",
    species: "grazed-pasture",
    subject: "sheep pasture to the horizon",
    height: 1.7,
    pitch: 7,
    credit: { author: "Richard Webb", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Sheep_pasture_-_geograph.org.uk_-_1211028.jpg" },
  },
  {
    id: "hay-anglesey",
    file: "hay-anglesey.jpg",
    species: "wildflower-meadow",
    subject: "orchid and buttercup hay meadow, crouched",
    height: 0.9,
    pitch: 4,
    credit: { author: "Velella", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Hay_meadow_on_Anglesey.jpg" },
  },
  {
    id: "hay-meadow",
    file: "hay-meadow.jpg",
    species: "hay-meadow",
    subject: "hay meadow with a mown path",
    height: 1.7,
    pitch: 3,
    credit: { author: "Glyn Baker", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Hay_Meadow_-_geograph.org.uk_-_1319948.jpg" },
  },
  {
    id: "prairie",
    file: "prairie.jpg",
    species: "prairie",
    subject: "mixed-grass prairie to the horizon",
    height: 1.7,
    pitch: 8,
    credit: { author: "Krzysztof Ziarnek, Kenraiz", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Mixed-grass_prairie_in_Badlands_NP_kz01.jpg" },
  },
  {
    id: "tussock-nz",
    file: "tussock-nz.jpg",
    species: "snow-tussock",
    subject: "tussock field from above",
    height: 1.6,
    pitch: 32,
    credit: { author: "Ulrich Lange, Bochum, Germany", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Tussock_Field_at_State_Highway_94,_New_Zealand.jpg" },
  },
];

/** A stylised end of the realism range: our own game's art as the reference, and what grass there should be. */
export interface GrassStyleTarget {
  id: string;
  /** Where the range sits for this target, 0 cartoon to 1 photoreal. */
  realism: number;
  /** Game views (from {@link GRASS_GAME_VIEWS}) whose art sets the target. */
  views: readonly string[];
  /** The written target. */
  target: string;
}

/** The cartoon and animated targets, set by our own games' art; no other studio's frames are committed. */
export const GRASS_STYLE_TARGETS: readonly GrassStyleTarget[] = [
  {
    id: "cartoon",
    realism: 0,
    views: ["bb-moor", "bb-moor-low"],
    target:
      "Beacon Bastion's toon moor. A few chunky blades per clump, wide with round or bold tips and even heights. Two to four flat colour bands with a strong dark-root to bright-tip gradient. Cel light from the engine toon ramp with a rim light, and an ink edge round each clump when outlines are on. The ground is one flat painted colour, flowers are flat oversized icons, and the field still reads full with no bare soil between clumps.",
  },
  {
    id: "animated",
    realism: 0.5,
    views: ["hh-park", "hh-park-low"],
    target:
      "Harbor Heat's sunset stylisation. Blades simplified but still countable, soft round tips and gentle irregularity. Smooth, saturated, warm colour with soft shading, a little sheen and glow through the leaf, no outline. Sway is springy, and flowers are simplified but known by their shape: a daisy's ring, a buttercup's cup, a bluebell's bells.",
  },
];

/** One game view a grass change is judged on: `bun run shoot <game> --mode play --look <look> --look-from <lookFrom>`. */
export interface GrassGameView {
  id: string;
  game: string;
  look: string;
  lookFrom: string;
}

/** The 18 game views every grass phase reshoots when looks change. */
export const GRASS_GAME_VIEWS: readonly GrassGameView[] = [
  { id: "hh-park", game: "harbor-heat", look: "0,60", lookFrom: "12,2.2,0.6" },
  { id: "hh-park-low", game: "harbor-heat", look: "-10,70", lookFrom: "4,0.8,0.3" },
  { id: "hh-dune", game: "harbor-heat", look: "-224,210", lookFrom: "10,2.2,0.6" },
  { id: "hh-dune-low", game: "harbor-heat", look: "-224,-180", lookFrom: "5,1.0,0.4" },
  { id: "fw-plains", game: "fernwild", look: "-180,800", lookFrom: "12,2.4,0.6" },
  { id: "fw-plains-low", game: "fernwild", look: "-150,780", lookFrom: "4,1.0,0.3" },
  { id: "fw-downs", game: "fernwild", look: "-900,330", lookFrom: "12,2.4,0.6" },
  { id: "fw-inland", game: "fernwild", look: "240,1120", lookFrom: "12,2.6,0.6" },
  { id: "fw-jungle", game: "fernwild", look: "60,150", lookFrom: "10,2.2,0.6" },
  { id: "fw-forest", game: "fernwild", look: "1010,280", lookFrom: "10,2.2,0.6" },
  { id: "fw-redwood", game: "fernwild", look: "620,-250", lookFrom: "10,2.2,0.6" },
  { id: "bb-moor", game: "beacon-bastion", look: "10,10", lookFrom: "12,3,0.6" },
  { id: "bb-moor-low", game: "beacon-bastion", look: "-15,20", lookFrom: "4,1.0,0.3" },
  { id: "bw-lawn", game: "brightway-park", look: "20,30", lookFrom: "10,2.5,0.6" },
  { id: "ec-field", game: "ember-command", look: "15,15", lookFrom: "14,4,0.6" },
  { id: "ec-field-low", game: "ember-command", look: "-20,10", lookFrom: "4,1.0,0.3" },
  { id: "ss-crash", game: "scrap-signal", look: "-492,572", lookFrom: "9,2.0,0.6" },
  { id: "ss-ridge", game: "scrap-signal", look: "-448,556", lookFrom: "10,2.4,0.6" },
];

/** The games that place grass, each measured by the board's perf pair. */
export const GRASS_GAMES = ["harbor-heat", "fernwild", "beacon-bastion", "brightway-park", "ember-command", "scrap-signal"] as const;

/** Side of one reference patch, metres: deep enough that a standing view reaches its horizon over grass. */
export const GRASS_REFERENCE_PATCH = 360;
/** Spacing between reference patches along x, metres. */
export const GRASS_REFERENCE_SPACING = 420;

/** Centre of reference patch `index`. */
export function grassReferenceCentre(index: number): [number, number] {
  return [(index - (GRASS_REFERENCE_PHOTOS.length - 1) / 2) * GRASS_REFERENCE_SPACING, 0];
}

/** The capture rig aims this far above its look point (the observer rig's default `lookHeight`). */
const OBSERVER_LOOK_HEIGHT = 1.2;

/**
 * The capture view for a reference photo: the camera stands a quarter of the patch in from its south
 * edge at the photo's height and tilts down by its pitch, so the ground target sits `height / tan(pitch)` ahead.
 * The look point sits {@link OBSERVER_LOOK_HEIGHT} below the ground so the rig's aim lands on it.
 */
export function grassReferenceView(index: number): { look: string; lookFrom: string } {
  const photo = GRASS_REFERENCE_PHOTOS[index]!;
  const [x, z] = grassReferenceCentre(index);
  const reach = photo.height / Math.tan((photo.pitch * Math.PI) / 180);
  const cameraZ = z + GRASS_REFERENCE_PATCH / 4;
  const round = (value: number) => Number(value.toFixed(3));
  const clearance = Math.min(1.5, photo.height * 0.5);
  return {
    look: `${round(x)},${-OBSERVER_LOOK_HEIGHT},${round(cameraZ - reach)}`,
    lookFrom: `${round(reach)},${round(photo.height + OBSERVER_LOOK_HEIGHT)},0,${round(clearance)}`,
  };
}
