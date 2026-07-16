import type {
  BackdropConfig,
  DirectionalLightingConfig,
  LightingConfig,
} from "@jgengine/core/game/playableGame";

const DEFAULT_BACKDROP_FOG_COLOR = "#1a1c22";

function DirectionalShadowLight({ entry }: { entry: DirectionalLightingConfig }) {
  const size = entry.shadowCameraSize ?? 40;
  return (
    <directionalLight
      position={[entry.position[0], entry.position[1], entry.position[2]]}
      intensity={entry.intensity ?? 1.3}
      color={entry.color}
      castShadow={entry.castShadow ?? false}
      shadow-mapSize-width={entry.shadowMapSize ?? 1024}
      shadow-mapSize-height={entry.shadowMapSize ?? 1024}
      shadow-camera-left={-size}
      shadow-camera-right={size}
      shadow-camera-top={size}
      shadow-camera-bottom={-size}
      shadow-camera-near={0.5}
      shadow-camera-far={Math.max(200, size * 6)}
      shadow-bias={entry.shadowBias ?? -0.0004}
      shadow-normalBias={entry.shadowNormalBias ?? 0.02}
    />
  );
}

export function ConfiguredLighting({ lighting }: { lighting: LightingConfig }) {
  return (
    <>
      {lighting.ambient !== undefined ? (
        <ambientLight color={lighting.ambient.color} intensity={lighting.ambient.intensity ?? 0.55} />
      ) : null}
      {lighting.hemisphere !== undefined ? (
        <hemisphereLight
          args={[
            lighting.hemisphere.skyColor ?? "#bfe3ff",
            lighting.hemisphere.groundColor ?? "#4c6b34",
            lighting.hemisphere.intensity ?? 0.55,
          ]}
        />
      ) : null}
      {(lighting.directional ?? []).map((entry, index) => (
        <DirectionalShadowLight key={index} entry={entry} />
      ))}
    </>
  );
}

export function BackdropFog({ fog }: { fog: BackdropConfig["fog"] }) {
  if (fog === undefined) return null;
  return fog.density !== undefined ? (
    <fogExp2 attach="fog" args={[fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.density]} />
  ) : (
    <fog attach="fog" args={[fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.near ?? 10, fog.far ?? 200]} />
  );
}
