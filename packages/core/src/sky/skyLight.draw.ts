import * as THREE from "three";

/** A world-space direction, `[x, y, z]`. */
export type SkyDirection = readonly [number, number, number];

/**
 * The light a sky gives the scene this frame, in the renderer's working colour space (the values a
 * shader adds before tone mapping). Whoever owns the sky writes it each frame with
 * {@link publishSkyLight}: the engine `Sky` does, and so can a game's own sky (a space sky, an alien sun,
 * a sky that changes with the zone). Water, clouds and anything else that shades by the sky read it
 * with {@link readSkyLight}, so they follow whatever sky the game draws.
 * @capability sky-light one per-frame record of sun, moon, sky colour and cloud cover that water, clouds and a game's own sky share
 */
export interface SkyLight {
  /** Unit vector toward the sun. Below the horizon (y < 0) the sun gives no light. */
  sunDirection: THREE.Vector3;
  /** Sunlight reaching the ground: colour times intensity, as a directional light carries it. Black when set. */
  sun: THREE.Color;
  /** Unit vector toward the moon. */
  moonDirection: THREE.Vector3;
  /** Moonlight: colour times intensity. */
  moon: THREE.Color;
  /** Light from the whole sky, as a hemisphere fill gives it. */
  ambient: THREE.Color;
  /** The sky straight overhead, as drawn. */
  zenith: THREE.Color;
  /** The sky at the horizon, as drawn; also the colour distant water and cloud fade into. */
  horizon: THREE.Color;
  /** How much of the sky cloud covers, 0..1, from the weather. */
  cloudCover: number;
}

/** A sky light at noon under a clear sky, for a scene whose sky has not published one yet. */
export function createSkyLight(): SkyLight {
  return {
    sunDirection: new THREE.Vector3(0.45, 0.78, 0.35).normalize(),
    sun: new THREE.Color(3, 2.9, 2.7),
    moonDirection: new THREE.Vector3(-0.45, -0.78, -0.35).normalize(),
    moon: new THREE.Color(0, 0, 0),
    ambient: new THREE.Color(0.55, 0.65, 0.8),
    zenith: new THREE.Color(0.1, 0.3, 0.75),
    horizon: new THREE.Color(0.55, 0.7, 0.85),
    cloudCover: 0,
  };
}

const lights = new WeakMap<THREE.Scene, SkyLight>();

/**
 * Record the sky's light for this frame on a scene. Publish one object and mutate it each frame; readers
 * keep the reference. A game drawing its own sky calls this from its `useFrame`.
 */
export function publishSkyLight(scene: THREE.Scene, light: SkyLight): void {
  lights.set(scene, light);
}

/** The light the scene's sky published, or `undefined` when no sky has. */
export function readSkyLight(scene: THREE.Scene): SkyLight | undefined {
  return lights.get(scene);
}
