import type { EditorVolume } from "../editor/types";
import { parseParams, type ParamSchema } from "../generator/paramSchema";
import { registerSceneKind, type SceneKindObject } from "../scene/sceneKinds";
import { WATER_VOLUME_KIND } from "../water/waterKind";
import type { FaunaArea, FaunaGroup, FaunaMotion, FaunaWindow } from "./ambientFauna";

/**
 * The editor volume kind that places an ambient group: its footprint is the area, or it borrows the
 * footprint of another volume (a water volume for a school, a grass field for a swarm).
 * @capability ambient-fauna-zone editor-authorable ambient group zone stored in editor.scene.json
 */
export const AMBIENT_FAUNA_KIND = "ambient_fauna";

const WINDOWS: Record<string, FaunaWindow | undefined> = {
  always: undefined,
  day: { sunMin: 0.05 },
  night: { sunMax: -0.05 },
  twilight: { sunMin: -0.25, sunMax: 0.15, fade: 0.1 },
};

/** The ambient group zone's parameters. */
export const AMBIENT_FAUNA_SCHEMA: ParamSchema = {
  fields: [
    { type: "text", key: "species", label: "species", default: "" },
    {
      type: "select",
      key: "motion",
      label: "motion",
      options: [
        { value: "school", label: "School (in water)" },
        { value: "swarm", label: "Swarm (near plants)" },
        { value: "drift", label: "Drift (motes)" },
        { value: "soar", label: "Soar (on the wind)" },
      ],
      default: "school",
    },
    { type: "number", key: "count", label: "count (0 = by density)", min: 0, step: 1, default: 0 },
    { type: "number", key: "density", label: "density per 1000 m²", min: 0, step: 0.1, default: 1 },
    {
      type: "select",
      key: "window",
      label: "out when",
      options: [
        { value: "always", label: "Always" },
        { value: "day", label: "Day" },
        { value: "night", label: "Night" },
        { value: "twilight", label: "Dawn and dusk" },
      ],
      default: "always",
    },
    { type: "number", key: "bandMin", label: "band low (m, 0 = default)", min: 0, step: 0.1, default: 0 },
    { type: "number", key: "bandMax", label: "band high (m, 0 = default)", min: 0, step: 0.1, default: 0 },
    { type: "number", key: "speed", label: "top speed (m/s, 0 = default)", min: 0, step: 0.1, default: 0 },
    { type: "number", key: "wander", label: "wander (m)", min: 0, step: 0.5, default: 3 },
    { type: "number", key: "budget", label: "draw budget (0 = all)", min: 0, step: 1, default: 0 },
    { type: "text", key: "volumeId", label: "borrow area from volume id", default: "" },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
};

function footprint(volume: Pick<EditorVolume, "shape" | "center" | "radius" | "halfExtents">): FaunaArea | null {
  const radius = volume.radius;
  if (volume.shape === "box") {
    const half = volume.halfExtents;
    if (half === undefined || !(half.x > 0) || !(half.z > 0)) return null;
    return { shape: "box", x: volume.center.x, z: volume.center.z, halfX: half.x, halfZ: half.z };
  }
  if (radius === undefined || !(radius > 0)) return null;
  return { shape: "disc", x: volume.center.x, z: volume.center.z, radius };
}

/**
 * The ambient groups an editor document places: one per `ambient_fauna` volume. A volume with no
 * `species` is skipped; `volumeId` borrows another volume's footprint and, for a water volume, its
 * top face as the school's surface.
 */
export function faunaGroupsFromVolumes(volumes: readonly Pick<EditorVolume, "id" | "kind" | "shape" | "center" | "radius" | "halfExtents" | "meta">[]): FaunaGroup[] {
  const groups: FaunaGroup[] = [];
  for (const volume of volumes) {
    if (volume.kind !== AMBIENT_FAUNA_KIND) continue;
    const p = parseParams(AMBIENT_FAUNA_SCHEMA, volume.meta);
    const species = String(p["species"] ?? "").trim();
    if (species === "") continue;
    const borrowed = String(p["volumeId"] ?? "").trim();
    const source = borrowed === "" ? volume : volumes.find((other) => other.id === borrowed);
    if (source === undefined) continue;
    const area = footprint(source);
    if (area === null) continue;
    const motion = p["motion"] as FaunaMotion;
    const count = Number(p["count"]);
    const low = Number(p["bandMin"]);
    const high = Number(p["bandMax"]);
    const speed = Number(p["speed"]);
    const budget = Number(p["budget"]);
    const seed = String(p["seed"] ?? "");
    const window = WINDOWS[String(p["window"])];
    const surface = source.kind === WATER_VOLUME_KIND && source.halfExtents !== undefined ? source.center.y + source.halfExtents.y : undefined;
    groups.push({
      id: volume.id,
      species,
      motion,
      area,
      seed: seed === "" ? volume.id : seed,
      ...(count > 0 ? { count } : { density: Number(p["density"]) }),
      ...(window === undefined ? {} : { window }),
      ...(low > 0 || high > 0 ? { band: { ...(low > 0 ? { min: low } : {}), ...(high > 0 ? { max: high } : {}) } } : {}),
      ...(speed > 0 ? { speed } : {}),
      wander: Number(p["wander"]),
      ...(budget > 0 ? { budget } : {}),
      ...(surface === undefined || motion !== "school" ? {} : { surface }),
    });
  }
  return groups;
}

/** Registers the `ambient_fauna` scene kind. Called by `registerBuiltinSceneKinds`. @internal */
export function registerAmbientFaunaKind(): void {
  registerSceneKind({
    kind: AMBIENT_FAUNA_KIND,
    target: "volume",
    label: "Ambient fauna",
    addCategory: "Environment",
    accent: "#3fd0c9",
    schema: AMBIENT_FAUNA_SCHEMA,
    note: (object: SceneKindObject) => {
      const groups = faunaGroupsFromVolumes([{ id: object.id, kind: object.kind, shape: object.halfExtents === undefined ? "sphere" : "box", center: object.center ?? { x: 0, y: 0, z: 0 }, ...(object.radius === undefined ? {} : { radius: object.radius }), ...(object.halfExtents === undefined ? {} : { halfExtents: object.halfExtents }), ...(object.meta === undefined ? {} : { meta: object.meta }) }]);
      return groups.length === 0 ? "Name a species and give the volume a footprint." : `${groups[0]!.motion} of ${groups[0]!.species}`;
    },
  });
}
