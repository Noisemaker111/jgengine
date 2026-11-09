import { useRef } from "react";
import * as THREE from "three";
import type { DirectionalLight } from "three";

import type {
  BackdropConfig,
  DirectionalLightingConfig,
  LightingConfig,
  PointLightingConfig,
  SpotLightingConfig,
} from "@jgengine/core/game/playableGame";
import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";
import { devtools } from "@jgengine/core/devtools/devtools";
import { sceneProbeReading } from "@jgengine/core/devtools/discover";

import { cascadedShadowsDraw } from "./CascadedShadows.draw";
import { lightShadowFilter } from "./softShadows";
import { cullSmallShadowCasters, MIN_SHADOW_CASTER_RADIUS, type ShadowCasterCull } from "./shadowCasters.draw";
import { installShadowCache } from "./shadowCache.draw";
import { minShadowCasterRadius, resolveCascadeCount, resolveShadowMapSize, SHADOW_CASTER_RADIUS_REFERENCE_MAP } from "./shadowTiers";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/** three.js lights default to white; an unset light colour means this. */
const LIGHT_DEFAULT_COLOR = "#ffffff";
const DEFAULT_BACKDROP_FOG_COLOR = "#1a1c22";
/** Default cap for combined dynamic point and spot lights. */
export const POINT_LIGHT_BUDGET = 8;

/**
 * Per-frame scaling a day cycle applies to a game's authored sun and ambient fill, so an authored
 * sun sets and a moon rises instead of the world staying lit like noon after dark. `sunFactor` and
 * `ambientFactor` are 1 at the authored noon peak; colors come from the atmosphere.
 * @internal
 */
export interface DaylightModulation {
  sunFactor: number;
  sunColor: string;
  ambientFactor: number;
}

/** @internal Clamp point lights for the runtime budget. */
export function resolvePointLightBudget(entries: readonly PointLightingConfig[] | undefined): readonly PointLightingConfig[] {
  if (entries === undefined || entries.length <= POINT_LIGHT_BUDGET) return entries ?? [];
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[jgengine:lighting] ${entries.length} point lights requested — clamped to budget ${POINT_LIGHT_BUDGET}`);
  }
  return entries.slice(0, POINT_LIGHT_BUDGET);
}

function resolveDynamicLights(lighting: LightingConfig): { point: readonly PointLightingConfig[]; spot: readonly SpotLightingConfig[] } {
  const point = lighting.point ?? [];
  const spot = lighting.spot ?? [];
  const budget = Math.max(0, Math.floor(lighting.maxDynamicLights ?? POINT_LIGHT_BUDGET));
  if (point.length + spot.length <= budget) return { point, spot };
  if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(`[jgengine:lighting] ${point.length + spot.length} dynamic lights requested — clamped to budget ${budget}`);
  return { point: point.slice(0, budget), spot: spot.slice(0, Math.max(0, budget - point.length)) };
}

function usesCascades(entry: DirectionalLightingConfig): boolean {
  return (entry.castShadow ?? false) && (entry.cascades ?? 1) > 1;
}

/**
 * Refresh a directional light's shadow projection after its frustum bounds change.
 * R3F pierced `shadow-camera-*` props write the bounds but never call
 * `updateProjectionMatrix()`, so depth renders with the stale default ~10×10 box
 * and `shadowCameraSize` is silently inert.
 * @internal
 */
export function syncShadowProjection(light: DirectionalLight): void {
  light.shadow.camera.updateProjectionMatrix();
}

/** Draw-side form of the single-shadow directional: one DirectionalLight whose shadow frustum
 * and filter retune on prop change, with daylight modulation applied per frame. */
function singleShadowLightDraw(getProps: () => {
  entry: DirectionalLightingConfig;
  profile?: GraphicsProfile | undefined;
  modulation?: DaylightModulation | undefined;
}): EngineDraw {
  let light: THREE.DirectionalLight | null = null;
  let lastSize = 0;
  let lastFar = 0;
  let lastMapSize = 0;
  let baseIntensity = 1.3;

  const applyEntry = () => {
    const props = getProps();
    const entry = props.entry;
    if (light === null) return;
    const size = entry.shadowCameraSize ?? 40;
    const far = Math.max(200, size * 6);
    const mapSize = entry.shadowMapSize ?? 1024;
    light.position.set(entry.position[0], entry.position[1], entry.position[2]);
    baseIntensity = entry.intensity ?? 1.3;
    light.color.set(entry.color ?? LIGHT_DEFAULT_COLOR);
    light.castShadow = entry.castShadow ?? false;
    light.shadow.bias = entry.shadowBias ?? -0.0004;
    const filter = lightShadowFilter(entry, props.profile, size * 2, mapSize, entry.shadowNormalBias ?? 0.02);
    light.shadow.normalBias = filter.normalBias;
    light.shadow.radius = filter.radius;
    // R3F pierced `shadow-camera-*` props write the bounds but never call
    // `updateProjectionMatrix()`, so depth renders with the stale default ~10×10 box
    // and `shadowCameraSize` is silently inert.
    const camera = light.shadow.camera;
    camera.left = -size;
    camera.right = size;
    camera.top = size;
    camera.bottom = -size;
    camera.near = 0.5;
    camera.far = far;
    if (size !== lastSize || far !== lastFar) {
      lastSize = size;
      lastFar = far;
      camera.updateProjectionMatrix();
    }
    if (mapSize !== lastMapSize) {
      lastMapSize = mapSize;
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    light.shadow.mapSize.set(mapSize, mapSize);
    const modulation = props.modulation;
    light.intensity = modulation === undefined ? baseIntensity : baseIntensity * modulation.sunFactor;
    if (modulation !== undefined) light.color.set(modulation.sunColor);
  };

  return {
    mount(state: EngineFrameState) {
      light = new THREE.DirectionalLight(LIGHT_DEFAULT_COLOR, 1);
      state.scene.add(light);
      light.target.position.set(0, 0, 0);
      state.scene.add(light.target);
      lastSize = -1;
      lastFar = -1;
      lastMapSize = -1;
      applyEntry();
    },
    update() {
      applyEntry();
    },
    frame() {
      const props = getProps();
      const modulation = props.modulation;
      if (light === null || modulation === undefined) return;
      light.intensity = baseIntensity * modulation.sunFactor;
      light.color.set(modulation.sunColor);
    },
    dispose(state: EngineFrameState) {
      if (light !== null) {
        state.scene.remove(light);
        state.scene.remove(light.target);
        light.shadow.map?.dispose();
        light.dispose();
        light = null;
      }
    },
  };
}

function directionalShadowLightDraw(getProps: () => {
  entry: DirectionalLightingConfig;
  profile?: GraphicsProfile | undefined;
  modulation?: DaylightModulation | undefined;
}): EngineDraw {
  // Resolved once per entry/profile pair: the child draws read props every frame, so the
  // resolved entry and the props object they see must not allocate per call.
  let cachedEntry: DirectionalLightingConfig | null = null;
  let cachedProfile: GraphicsProfile | undefined;
  let cachedResolved: DirectionalLightingConfig | null = null;
  const resolvedEntry = (): DirectionalLightingConfig => {
    const props = getProps();
    const entry = props.entry;
    if (cachedResolved !== null && entry === cachedEntry && props.profile === cachedProfile) return cachedResolved;
    cachedEntry = entry;
    cachedProfile = props.profile;
    cachedResolved = props.profile === undefined
      ? entry
      : {
          ...entry,
          shadowMapSize: resolveShadowMapSize(props.profile, entry.shadowMapSize),
          cascades: resolveCascadeCount(props.profile, entry.cascades),
        };
    return cachedResolved;
  };
  let childProps: { entry: DirectionalLightingConfig; profile?: GraphicsProfile | undefined; modulation?: DaylightModulation | undefined } | null = null;
  const childGetProps = () => {
    const props = getProps();
    if (childProps === null) {
      childProps = { entry: resolvedEntry() };
    } else {
      childProps.entry = resolvedEntry();
    }
    childProps.profile = props.profile;
    childProps.modulation = props.modulation;
    return childProps;
  };
  let child: EngineDraw | null = null;
  let childKind = "";
  const ensure = (state: EngineFrameState) => {
    const kind = usesCascades(resolvedEntry()) ? "cascade" : "single";
    if (child !== null && kind === childKind) return;
    child?.dispose?.(state);
    child = kind === "cascade" ? cascadedShadowsDraw(childGetProps) : singleShadowLightDraw(childGetProps);
    childKind = kind;
    child.mount?.(state);
  };
  return {
    mount(state: EngineFrameState) {
      ensure(state);
    },
    update(state: EngineFrameState) {
      ensure(state);
      child?.update?.(state);
    },
    frame(state: EngineFrameState) {
      child?.frame?.(state);
    },
    dispose(state: EngineFrameState) {
      child?.dispose?.(state);
      child = null;
      childKind = "";
    },
  };
}

/** Draw-side form of {@link ConfiguredLighting}: all authored lights live in one group; the light
 * set rebuilds when the `lighting` config or `profile` identity changes, the shadow-caster cull,
 * shadow cache and devtools probes follow `shadowsCast`/`casterRadius`, and daylight modulation
 * retunes ambient, hemisphere and the first directional per frame. */
export function configuredLightingDraw(getProps: () => {
  lighting: LightingConfig;
  profile?: GraphicsProfile | undefined;
  modulation?: DaylightModulation | undefined;
}): EngineDraw {
  const group = new THREE.Group();
  let children: EngineDraw[] = [];
  const dynamicLights: (THREE.PointLight | THREE.SpotLight)[] = [];
  let ambient: THREE.AmbientLight | null = null;
  let hemisphere: THREE.HemisphereLight | null = null;
  let baseAmbient = 0.55;
  let baseHemisphere = 0.55;
  let shadowsCast = false;
  let casterRadius = MIN_SHADOW_CASTER_RADIUS;
  let cull: ShadowCasterCull | null = null;
  let cullRadius = -1;
  let probeRadius = -1;
  let shadowCache: ReturnType<typeof installShadowCache> | null = null;
  let offCacheProbe: (() => void) | null = null;
  let offShadowProbe: (() => void) | null = null;
  let installedKey: readonly unknown[] | null = null;
  let gl: THREE.WebGLRenderer | null = null;

  // One draw per resolved directional; only the first carries daylight modulation, and the
  // modulation object is read live so a day-cycle swap never rebuilds the lights.
  const directionalDrawFor = (
    entry: DirectionalLightingConfig,
    profile: GraphicsProfile | undefined,
    modulated: boolean,
  ): EngineDraw => {
    const props: { entry: DirectionalLightingConfig; profile?: GraphicsProfile | undefined; modulation?: DaylightModulation | undefined } = { entry, profile };
    const read = () => {
      props.modulation = modulated ? getProps().modulation : undefined;
      return props;
    };
    return usesCascades(entry) ? cascadedShadowsDraw(read) : singleShadowLightDraw(read);
  };

  const clearLights = () => {
    if (lastState !== null) for (const child of children) child.dispose?.(lastState);
    children = [];
    for (const light of dynamicLights.splice(0)) {
      group.remove(light);
      if (light instanceof THREE.SpotLight) group.remove(light.target);
      light.shadow?.dispose();
    }
    if (ambient !== null) {
      group.remove(ambient);
      ambient.dispose();
      ambient = null;
    }
    if (hemisphere !== null) {
      group.remove(hemisphere);
      hemisphere.dispose();
      hemisphere = null;
    }
  };

  let lastState: EngineFrameState | null = null;

  const syncLights = (state: EngineFrameState) => {
    lastState = state;
    const props = getProps();
    const { lighting, profile } = props;
    const key: readonly unknown[] = [lighting, profile];
    const prev = installedKey;
    if (prev !== null && prev.length === key.length && key.every((dep, index) => dep === prev[index])) return;
    installedKey = key;
    clearLights();
    const dynamic = resolveDynamicLights(lighting);
    if (lighting.ambient !== undefined) {
      ambient = new THREE.AmbientLight(lighting.ambient.color ?? LIGHT_DEFAULT_COLOR);
      baseAmbient = lighting.ambient.intensity ?? 0.55;
      ambient.intensity = baseAmbient;
      group.add(ambient);
    }
    if (lighting.hemisphere !== undefined) {
      hemisphere = new THREE.HemisphereLight(
        lighting.hemisphere.skyColor ?? "#bfe3ff",
        lighting.hemisphere.groundColor ?? "#4c6b34",
        lighting.hemisphere.intensity ?? 0.55,
      );
      baseHemisphere = lighting.hemisphere.intensity ?? 0.55;
      group.add(hemisphere);
    }
    (lighting.directional ?? []).forEach((entry, index) => {
      const resolved = profile === undefined
        ? entry
        : {
            ...entry,
            shadowMapSize: resolveShadowMapSize(profile, entry.shadowMapSize),
            cascades: resolveCascadeCount(profile, entry.cascades),
          };
      children.push(directionalDrawFor(resolved, profile, index === 0));
    });
    for (const entry of dynamic.point) {
      const light = new THREE.PointLight(entry.color ?? LIGHT_DEFAULT_COLOR, entry.intensity ?? 1, entry.distance ?? 0, entry.decay ?? 2);
      light.position.set(entry.position[0], entry.position[1], entry.position[2]);
      light.castShadow = entry.castShadow ?? false;
      group.add(light);
      dynamicLights.push(light);
    }
    for (const entry of dynamic.spot) {
      const light = new THREE.SpotLight(entry.color ?? LIGHT_DEFAULT_COLOR, entry.intensity ?? 1, entry.distance ?? 0, entry.angle ?? Math.PI / 6, entry.penumbra ?? 0, entry.decay ?? 2);
      light.position.set(entry.position[0], entry.position[1], entry.position[2]);
      light.castShadow = entry.castShadow ?? false;
      light.target.position.set(...(entry.target ?? [0, 0, 0]));
      group.add(light);
      group.add(light.target);
      dynamicLights.push(light);
    }
    for (const child of children) child.mount?.(state);
    shadowsCast = (lighting.directional ?? []).some((entry) => entry.castShadow === true);
    casterRadius = minShadowCasterRadius(
      profile?.shadowMapSize ?? SHADOW_CASTER_RADIUS_REFERENCE_MAP,
      MIN_SHADOW_CASTER_RADIUS,
    );
    syncShadowSystems(state);
  };

  const syncShadowSystems = (state: EngineFrameState) => {
    const root = state.rootScene ?? state.scene;
    if (!shadowsCast) {
      cull?.restore();
      cull = null;
      cullRadius = -1;
      if (shadowCache !== null) {
        const handle = shadowCache.handle;
        shadowCache.dispose();
        shadowCache = null;
        if (typeof window !== "undefined" && window.__jgShadowCache === handle) delete window.__jgShadowCache;
      }
      offCacheProbe?.();
      offCacheProbe = null;
    } else {
      if (cull === null || cullRadius !== casterRadius) {
        cull?.restore();
        cull = cullSmallShadowCasters(root, casterRadius);
        cullRadius = casterRadius;
      }
      if (shadowCache === null && gl !== null) {
        // Every backend: the audit reads back through a fence, which the WebGPU backend answers too, so
        // `perf shadow-audit --renderer webgpu` proves its cached maps as it does WebGL's.
        const cache = installShadowCache(gl, root);
        shadowCache = cache;
        if (typeof window !== "undefined") {
          window.__jgShadowCache = cache.handle;
          // `bun run perf shadow-audit` loads the page with this flag: every cached map is checked against a full redraw.
          if (new URLSearchParams(window.location?.search ?? "").get("shadowAudit") === "1") cache.handle.setAudit(true);
        }
        offCacheProbe = devtools.probes.registerSystem("render/shadow-cache", {
          counters: () => {
            const stats = cache.handle.stats();
            return {
              casters: stats.casters,
              static: stats.staticCasters,
              checks: stats.checks,
              cpuMs: stats.cpuMs,
              ...stats.passes,
              auditMaps: stats.audit.maps,
              auditMismatchedMaps: stats.audit.mismatchedMaps,
              auditMismatchedTexels: stats.audit.mismatchedTexels,
              auditFailed: stats.audit.failed,
              auditSkipped: stats.audit.skipped,
            };
          },
          state: () => {
            const { passes, staticCasters, casters } = cache.handle.stats();
            return `${staticCasters}/${casters} casters static · passes full ${passes.full} rebuild ${passes.rebuild} reuse ${passes.reuse} hold ${passes.hold}`;
          },
        });
      }
    }
    // The caster probe registers whether or not a shadow light exists — it reports the empty state.
    if (offShadowProbe === null || probeRadius !== casterRadius) {
      offShadowProbe?.();
      offShadowProbe = null;
      probeRadius = casterRadius;
      const casterStats = sceneProbeReading(() => cull?.stats());
      offShadowProbe = devtools.probes.registerSystem("render/shadows", {
        counters: () => casterStats() ?? { casters: 0, skipped: 0, minRadius: casterRadius },
        state: () => {
          const stats = casterStats();
          return stats === undefined
            ? "no shadow-casting directional light"
            : `${stats.casters} casters · ${stats.skipped} under ${stats.minRadius} m skipped`;
        },
      });
    }
  };

  return {
    mount(state: EngineFrameState) {
      gl = state.gl;
      state.scene.add(group);
      syncLights(state);
    },
    update(state: EngineFrameState) {
      syncLights(state);
      for (const child of children) child.update?.(state);
    },
    frame(state: EngineFrameState) {
      const modulation = getProps().modulation;
      if (modulation !== undefined) {
        if (ambient !== null) ambient.intensity = baseAmbient * modulation.ambientFactor;
        if (hemisphere !== null) hemisphere.intensity = baseHemisphere * modulation.ambientFactor;
      }
      for (const child of children) child.frame?.(state);
    },
    dispose(state: EngineFrameState) {
      clearLights();
      state.scene.remove(group);
      cull?.restore();
      cull = null;
      cullRadius = -1;
      if (shadowCache !== null) {
        const handle = shadowCache.handle;
        shadowCache.dispose();
        shadowCache = null;
        if (typeof window !== "undefined" && window.__jgShadowCache === handle) delete window.__jgShadowCache;
      }
      offCacheProbe?.();
      offCacheProbe = null;
      offShadowProbe?.();
      offShadowProbe = null;
      probeRadius = -1;
      installedKey = null;
      gl = null;
      lastState = null;
    },
  };
}

/**
 * Mounts the game's authored lights (ambient, hemisphere, directional with shadows, point and spot within the light budget) for the active graphics profile.
 */
export function ConfiguredLighting(props: {
  lighting: LightingConfig;
  profile?: GraphicsProfile;
  /** Day-cycle scaling for the first directional (the sun) and the ambient fill. */
  modulation?: DaylightModulation;
}) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => configuredLightingDraw(() => latest.current)} deps={[]} />;
}

/** Draw-side form of {@link BackdropFog}: writes the backdrop's linear or exponential fog onto the
 * real scene (a scoped mount group's `scene` is not the scene fog lives on); clears it on dispose. */
export function backdropFogDraw(getProps: () => { fog: BackdropConfig["fog"] }): EngineDraw {
  return {
    mount(state: EngineFrameState) {
      const fog = getProps().fog;
      if (fog === undefined) return;
      const scene = state.rootScene ?? state.scene;
      scene.fog = fog.density !== undefined
        ? new THREE.FogExp2(fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.density)
        : new THREE.Fog(fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.near ?? 10, fog.far ?? 200);
    },
    update(state: EngineFrameState) {
      const fog = getProps().fog;
      const scene = state.rootScene ?? state.scene;
      if (fog === undefined) {
        scene.fog = null;
        return;
      }
      const current = scene.fog;
      const color = fog.color ?? DEFAULT_BACKDROP_FOG_COLOR;
      if (fog.density !== undefined) {
        if (current instanceof THREE.FogExp2) {
          current.color.set(color);
          current.density = fog.density;
        } else {
          scene.fog = new THREE.FogExp2(color, fog.density);
        }
      } else if (current instanceof THREE.Fog && !(current instanceof THREE.FogExp2)) {
        current.color.set(color);
        current.near = fog.near ?? 10;
        current.far = fog.far ?? 200;
      } else {
        scene.fog = new THREE.Fog(color, fog.near ?? 10, fog.far ?? 200);
      }
    },
    dispose(state: EngineFrameState) {
      const scene = state.rootScene ?? state.scene;
      scene.fog = null;
    },
  };
}

/** Attaches the backdrop's linear or exponential fog to the scene; renders nothing without fog. */
export function BackdropFog(props: { fog: BackdropConfig["fog"] }) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => backdropFogDraw(() => latest.current)} deps={[]} />;
}
