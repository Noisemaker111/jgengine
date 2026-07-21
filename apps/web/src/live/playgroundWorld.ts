/**
 * The playground's 3D viewer: the dials regenerate a GeneratedCity (or a
 * closed circuit) and this module rebuilds the merged city model around an
 * orbit camera. First build grows in; slider drags rebuild instantly.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { GeneratedCity } from "@jgengine/core/world/cityGenerator";
import { buildCityModel, buildGround, makeElevationField, type CityModel, type CityPalette } from "./cityScene";
import { disposeObject, mountLive, type LiveHandle } from "./mount";

const INK = 0x04060c;

const PALETTE: CityPalette = {
  building: 0x38465c,
  streets: { boulevard: 0x33465f, avenue: 0x2a3a50, street: 0x223043, lane: 0x1a2534 },
  glow: 0x34d399,
  windowWarm: 0xffd9a0,
  windowCool: 0x67e8f9,
  trafficA: 0xfff3d6,
  trafficB: 0xf87171,
  lightA: 0x34d399,
  lightB: 0x22d3ee,
  fogDensity: 0.0014,
  sidewalk: 0x394a61,
  roof: 0x1d2836,
  trim: 0x556880,
  accent: 0x8a5a3c,
};

export interface PlaygroundWorldHandle {
  setCity(
    city: GeneratedCity,
    options: {
      seed: string;
      heightScale?: number;
      animate?: boolean;
      /** "circuit" gets track dressing + a rolling-lap framing; "city" gets gentle-hill framing. */
      mode?: "city" | "circuit";
      /** Elevation dial, 0..1 — scales the shared terrain field amplitude. */
      elevation?: number;
      /** World half-size the field wavelength scales from. */
      extent?: number;
      /** Deterministic camera override: orbit target XZ, distance, and pitch (degrees). When set it
       *  wins over the automatic framing on every rebuild — the close-up inspection seam. */
      camera?: { x: number; z: number; radius: number; pitch: number; yaw?: number };
      sidewalks?: boolean;
      sidewalkWidth?: number;
      laneMarkings?: boolean;
      laneMarkingWidth?: number;
      laneMarkingOffset?: number;
      laneMarkingDash?: number;
      laneMarkingGap?: number;
      /** Show building lots. Default true; false for unobstructed junction close-ups. */
      buildings?: boolean;
      /** Placeholder cuboid traffic. Default false (not acceptable as visual evidence). */
      traffic?: boolean;
    },
  ): Promise<void>;
  dispose(): void;
}

export function createPlaygroundWorld(container: HTMLElement): PlaygroundWorldHandle {
  let model: CityModel | null = null;
  let ground: THREE.Group | null = null;
  let modelElapsed = 0;
  let lastMode: string | undefined;
  let resolveReady: (() => void) | null = null;

  const handle: LiveHandle = mountLive(container, {
    fov: 46,
    far: 2600,
    frame(dt) {
      modelElapsed += dt;
      controls.update();
      model?.update(dt, modelElapsed);
      if (model?.settled() === true && resolveReady !== null) {
        const resolve = resolveReady;
        resolveReady = null;
        resolve();
      }
    },
    onDispose() {
      controls.dispose();
    },
  });

  handle.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  handle.scene.fog = new THREE.FogExp2(INK, PALETTE.fogDensity);
  // Slightly brighter sky term so night silhouettes (gables, domes, cylinders) read off the fog.
  const hemisphere = new THREE.HemisphereLight(0x6f88a6, 0x0c1120, 1.7);
  const moon = new THREE.DirectionalLight(0xb6c8e0, 1.5);
  moon.position.set(180, 320, -140);
  handle.scene.add(hemisphere, moon);

  handle.camera.position.set(240, 190, 240);
  const controls = new OrbitControls(handle.camera, handle.renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 8;
  controls.maxDistance = 900;
  if (handle.reducedMotion) {
    // No RAF loop under reduced motion — render on demand as the user orbits.
    controls.addEventListener("change", () => handle.invalidate());
  }

  return {
    setCity(city, options) {
      resolveReady?.();
      resolveReady = null;
      model?.dispose();
      const mode = options.mode ?? "city";
      const circuit = mode === "circuit";
      // Shared terrain field: prefer the network's own `elevationAt` (once the core contract lands),
      // else synthesize a smooth field from the elevation dial so the world still rolls. Circuits get
      // taller, tighter crests for a rolling lap; the city gets broad, gentle hills.
      const elevation = options.elevation ?? 0;
      const extent = options.extent ?? 260;
      const networkField = (city.network as { elevationAt?: (x: number, z: number) => number }).elevationAt;
      // Amplitudes chosen so the terrain reads: a circuit rolls over real crests (no buildings to hide
      // relief), the city keeps gentle hills that vary building bases without becoming mountains.
      const amplitude = elevation * (circuit ? 58 : 34);
      const wavelength = extent * (circuit ? 1.05 : 1.7);
      const sampleHeight = networkField ?? makeElevationField(options.seed, amplitude, wavelength);
      model = buildCityModel(city, PALETTE, {
        seed: options.seed,
        instant: handle.reducedMotion || options.animate !== true,
        heightScale: options.heightScale ?? 1,
        sampleHeight,
        trackDressing: circuit,
        sidewalks: options.sidewalks,
        sidewalkWidth: options.sidewalkWidth,
        laneMarkings: options.laneMarkings,
        laneMarkingWidth: options.laneMarkingWidth,
        laneMarkingOffset: options.laneMarkingOffset,
        laneMarkingDash: options.laneMarkingDash,
        laneMarkingGap: options.laneMarkingGap,
        centerlineGlow: false,
        // Focused junction inspection: hide buildings so carriageways fill the frame.
        buildings: options.buildings ?? options.camera === undefined,
        // Cuboid traffic is not acceptable vehicle evidence; keep it off.
        traffic: options.traffic === true,
      });
      handle.scene.add(model.group);
      // Reframe on the first build AND whenever the mode flips (city ↔ circuit is a new kind of layout);
      // between those the camera belongs to the user's orbiting.
      const reframe = options.animate === true || (options.mode !== undefined && options.mode !== lastMode);
      lastMode = options.mode;
      if (options.camera !== undefined) {
        const cam = options.camera;
        const pitch = (cam.pitch * Math.PI) / 180;
        const yaw = ((cam.yaw ?? 45) * Math.PI) / 180;
        const groundY = sampleHeight(cam.x, cam.z);
        const horiz = cam.radius * Math.cos(pitch);
        handle.camera.position.set(
          cam.x + horiz * Math.cos(yaw),
          groundY + cam.radius * Math.sin(pitch),
          cam.z + horiz * Math.sin(yaw),
        );
        controls.target.set(cam.x, groundY, cam.z);
        controls.update();
      } else if (reframe) {
        // Frame the whole generated extent from a pleasing ~33–40° pitch orbit so first paint shows the
        // layout and its rolling silhouette, not a half-empty low angle.
        const r = model.radius;
        // Circuits pull back further and sit a touch higher than a city: a dense (compactness→1) track
        // fills its whole footprint with switchbacks, so a low rolling-lap framing clipped the near
        // corridors off the bottom. This steeper, further orbit fits the entire footprint yet still
        // reads as a rolling lap for an open loop.
        const horiz = circuit ? 1.08 : 0.92; // pull back enough that nothing clips at the frame edges
        const lift = circuit ? 1.12 : 1.02; // pitch ≈ atan(lift / (horiz·√2))
        handle.camera.position.set(r * horiz, r * lift, r * horiz);
        controls.target.set(0, circuit ? 4 : 14, 0);
        controls.update();
      }
      const wantRadius = model.radius + 120;
      const drape = elevation > 0 || networkField !== undefined;
      // Rebuild the ground whenever the terrain it drapes could have changed: extent, seed, mode, or the
      // elevation dial (the field is seeded from all of these), so raised roads never clip a stale disc.
      if (
        ground === null ||
        Math.abs(wantRadius - (ground.userData.radius as number)) > 60 ||
        ground.userData.seed !== options.seed ||
        ground.userData.mode !== mode ||
        ground.userData.elevation !== elevation
      ) {
        if (ground !== null) {
          handle.scene.remove(ground);
          disposeObject(ground);
        }
        ground = buildGround(wantRadius, PALETTE.glow, drape ? sampleHeight : undefined);
        ground.userData.radius = wantRadius;
        ground.userData.seed = options.seed;
        ground.userData.mode = mode;
        ground.userData.elevation = elevation;
        handle.scene.add(ground);
      }
      modelElapsed = 0;
      return new Promise<void>((resolve) => {
        resolveReady = resolve;
        // Rendering this invalidation applies both the rebuilt model and any camera override. Animated
        // builds resolve from the normal frame loop only after CityModel reports that growth settled.
        handle.invalidate();
      });
    },
    dispose() {
      resolveReady?.();
      model?.dispose();
      handle.dispose();
    },
  };
}
