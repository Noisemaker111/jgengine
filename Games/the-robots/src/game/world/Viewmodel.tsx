import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { useRef, useState } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { WeatherLayer } from "@jgengine/shell/weather";
import { airAt, gust } from "./air";
import { zoneAt } from "./zones";
import { equippedGun, gameNow, lastShot } from "../feel";
import { gunById, isReloading, type GunDef, type GunFamily } from "../handroll";
import { ELEMENT_COLORS } from "../palette";

/**
 * Blaster silhouettes, built from primitives rather than cast from a model pack.
 *
 * No pack we ship has a gun, and the previous casting pointed the player's weapon at fantasy melee
 * meshes — a *dagger* stood in for the pistol, a crossbow for the SMG, an axe for the shotgun. In a
 * first-person shooter that mesh is on screen every single frame, so it was the most-seen wrong
 * asset in the game. Composed boxes read as a machined sci-fi weapon and take their proportions from
 * the family, which a fantasy axe never could.
 */
interface BlasterSpec {
  /** Receiver block: width, height, length in metres. */
  body: readonly [number, number, number];
  /** Barrel: radius, length. */
  barrel: readonly [number, number];
  /** Boxy magazine below the receiver, or `null` for none. */
  magazine: readonly [number, number, number] | null;
  /** Optic block above the receiver, or `null` for iron sights. */
  optic: readonly [number, number, number] | null;
  /** Muzzle-brake plate at the barrel tip — shotguns and launchers flare. */
  brake: number | null;
}

const FAMILY_BLASTER: Record<GunFamily, BlasterSpec> = {
  pistol: {
    body: [0.055, 0.1, 0.2],
    barrel: [0.017, 0.12],
    magazine: [0.045, 0.09, 0.05],
    optic: null,
    brake: null,
  },
  smg: {
    body: [0.06, 0.1, 0.26],
    barrel: [0.015, 0.14],
    magazine: [0.04, 0.16, 0.05],
    optic: [0.03, 0.025, 0.07],
    brake: null,
  },
  shotgun: {
    body: [0.075, 0.11, 0.34],
    barrel: [0.028, 0.26],
    magazine: null,
    optic: null,
    brake: 0.05,
  },
  rifle: {
    body: [0.065, 0.11, 0.38],
    barrel: [0.019, 0.24],
    magazine: [0.045, 0.14, 0.06],
    optic: [0.035, 0.035, 0.11],
    brake: null,
  },
  sniper: {
    body: [0.06, 0.1, 0.44],
    barrel: [0.017, 0.34],
    magazine: [0.04, 0.1, 0.05],
    optic: [0.042, 0.045, 0.18],
    brake: 0.032,
  },
  launcher: {
    body: [0.09, 0.13, 0.36],
    barrel: [0.055, 0.24],
    magazine: null,
    optic: [0.03, 0.03, 0.08],
    brake: 0.085,
  },
};

const MANUFACTURER_COLORS: Record<string, string> = {
  Blackwood: "#6e4a2c",
  Apex: "#c9c4b8",
  Voltek: "#2c4a6e",
  Chuckwerk: "#5a6a5e",
  Detonic: "#7a2c1e",
  Ironworks: "#5e3a2c",
  Vanguard: "#4e5a3c",
  Scrapjack: "#5a5248",
};

/** Machined dark steel for every receiver; the manufacturer colour rides on the plating instead. */
const GUN_STEEL = "#3a3f45";

/**
 * Where the muzzle flash sits, derived from the family's own barrel geometry rather than a
 * hand-tuned table — a table drifts out of sync the moment a barrel length changes. Matches the
 * blaster group's own `position` and `rotation={[0, PI, 0]}`, so the sign is already flipped.
 */
function muzzleOffsetZ(family: GunFamily): number {
  const spec = FAMILY_BLASTER[family];
  const tip = spec.body[2] / 2 + spec.barrel[1] + (spec.brake === null ? 0 : 0.045);
  return -(tip - 0.1);
}

function GunMesh({ gun }: { gun: GunDef }) {
  const spec = FAMILY_BLASTER[gun.family];
  const plating = MANUFACTURER_COLORS[gun.manufacturer] ?? "#7a6a58";
  const glow = gun.element !== "none" ? ELEMENT_COLORS[gun.element] : null;
  const [bodyW, bodyH, bodyL] = spec.body;
  const [barrelR, barrelL] = spec.barrel;
  const barrelZ = -(bodyL / 2 + barrelL / 2);

  return (
    <group rotation={[0, Math.PI, 0]} position={[0, -0.02, -0.1]}>
      {/* Receiver */}
      <mesh castShadow={false}>
        <boxGeometry args={[bodyW, bodyH, bodyL]} />
        <meshStandardMaterial color={GUN_STEEL} metalness={0.85} roughness={0.34} />
      </mesh>
      {/* Manufacturer plating along the receiver flank — where the brand colour reads. */}
      <mesh position={[bodyW / 2 + 0.004, bodyH * 0.1, 0]}>
        <boxGeometry args={[0.008, bodyH * 0.55, bodyL * 0.7]} />
        <meshStandardMaterial color={plating} metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[-(bodyW / 2 + 0.004), bodyH * 0.1, 0]}>
        <boxGeometry args={[0.008, bodyH * 0.55, bodyL * 0.7]} />
        <meshStandardMaterial color={plating} metalness={0.7} roughness={0.4} />
      </mesh>
      {/* Barrel */}
      <mesh position={[0, bodyH * 0.16, barrelZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[barrelR, barrelR, barrelL, 12]} />
        <meshStandardMaterial color={GUN_STEEL} metalness={0.9} roughness={0.28} />
      </mesh>
      {spec.brake === null ? null : (
        <mesh position={[0, bodyH * 0.16, barrelZ - barrelL / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[spec.brake, barrelR * 1.2, 0.045, 12]} />
          <meshStandardMaterial color={GUN_STEEL} metalness={0.85} roughness={0.36} />
        </mesh>
      )}
      {/* Grip, angled back into the palm. */}
      <mesh position={[0, -(bodyH * 0.62), bodyL * 0.3]} rotation={[0.32, 0, 0]}>
        <boxGeometry args={[bodyW * 0.8, bodyH * 0.9, bodyL * 0.22]} />
        <meshStandardMaterial color="#23262a" metalness={0.4} roughness={0.72} />
      </mesh>
      {spec.magazine === null ? null : (
        <mesh position={[0, -(bodyH / 2 + spec.magazine[1] / 2), -bodyL * 0.08]}>
          <boxGeometry args={spec.magazine as unknown as [number, number, number]} />
          <meshStandardMaterial color="#2b2f34" metalness={0.6} roughness={0.5} />
        </mesh>
      )}
      {spec.optic === null ? null : (
        <mesh position={[0, bodyH / 2 + spec.optic[1] / 2, bodyL * 0.05]}>
          <boxGeometry args={spec.optic as unknown as [number, number, number]} />
          <meshStandardMaterial color="#1d2024" metalness={0.5} roughness={0.4} />
        </mesh>
      )}
      {/* Element charge cell: the only emissive part, so the element read comes off the gun itself. */}
      {glow === null ? null : (
        <mesh position={[0, bodyH * 0.05, bodyL * 0.12]}>
          <boxGeometry args={[bodyW * 1.06, bodyH * 0.2, bodyL * 0.18]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.8} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The air the player stands in. Dust density, drift, and colour come from the zone's one air
 * description — the same numbers driving the wind bed — so a gust is heard and seen at once, and
 * the Blight's violet reactor ash reads as a different place from Rustflat's sand.
 */
function FerralonAir() {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const [air, setAir] = useState(() => airAt(null));
  const [strength, setStrength] = useState(1);
  const zoneId = useRef<string | null>(null);

  useFrame(() => {
    const zone = zoneAt(camera.position.x, camera.position.z);
    const nextId = zone?.id ?? null;
    if (nextId !== zoneId.current) {
      zoneId.current = nextId;
      setAir(airAt(nextId));
    }
    // Quantised so a continuous gust curve does not re-render every frame.
    const next = Math.round(gust(ctx.time.now() * 1000) * 20) / 20;
    setStrength((current) => (current === next ? current : next));
  });

  const blow = air.wind * strength;
  return (
    <WeatherLayer
      mode="dust"
      intensity={0.35 + blow * 0.85}
      wind={[blow * 3.4 * air.rate, 0, blow * 1.6 * air.rate]}
      dust={{
        color: air.dust,
        opacity: 0.24 + blow * 0.3,
        size: 0.26,
        speed: 1.6 + blow * 3.2,
        // Tighter than the default volume so the motes concentrate in the near field where the
        // parallax actually reads, instead of thinning out across 70 m of empty air.
        volume: [46, 15, 46],
      }}
    />
  );
}

export function FerralonWorldOverlay() {
  return (
    <>
      <FerralonAir />
      <FerralonViewmodel />
    </>
  );
}

export function FerralonViewmodel() {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const rig = useRef<Group>(null);
  const flash = useRef<Group>(null);
  const lastCameraPos = useRef(new Vector3());
  const bobTime = useRef(0);
  const gunId = equippedGun();
  const gun = gunId === null ? undefined : gunById(gunId);

  useFrame((state, dt) => {
    const group = rig.current;
    if (group === null) return;
    const nowMs = gameNow();

    const speed = lastCameraPos.current.distanceTo(camera.position) / Math.max(dt, 1 / 240);
    lastCameraPos.current.copy(camera.position);
    const moving = Math.min(1, speed / 6);
    bobTime.current += dt * (4 + moving * 6);

    const shot = lastShot();
    const sinceShot = nowMs - shot.atMs;
    const recoil = sinceShot >= 0 && sinceShot < 140 ? Math.sin((sinceShot / 140) * Math.PI) : 0;

    let reloadDip = 0;
    let reloadSpin = 0;
    if (gun !== undefined && isReloading(ctx, gun)) {
      reloadDip = 0.16;
      reloadSpin = Math.sin(state.clock.elapsedTime * 9) * 0.35;
    }

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX(0.24 + Math.sin(bobTime.current) * 0.006 * (0.4 + moving));
    group.translateY(-0.24 - reloadDip + Math.abs(Math.cos(bobTime.current)) * 0.009 * (0.4 + moving) + recoil * 0.02);
    group.translateZ(-0.5 + recoil * 0.07);
    group.rotateX(recoil * 0.09 - reloadSpin * 0.6);
    group.rotateZ(reloadSpin * 0.12);

    if (flash.current) {
      const visible = sinceShot >= 0 && sinceShot < 70;
      flash.current.visible = visible;
      if (visible) flash.current.rotation.z = (nowMs % 97) / 15;
    }
  });

  if (gun === undefined) return null;
  const muzzleZ = muzzleOffsetZ(gun.family);
  return (
    <group ref={rig} renderOrder={999}>
      <GunMesh gun={gun} />
      <group ref={flash} position={[0, 0.012, muzzleZ]} visible={false}>
        <mesh>
          <planeGeometry args={[0.16, 0.16]} />
          <meshBasicMaterial color="#ffd76a" transparent opacity={0.95} depthWrite={false} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.16, 0.16]} />
          <meshBasicMaterial color="#ff9a3e" transparent opacity={0.85} depthWrite={false} />
        </mesh>
        <pointLight color="#ffb347" intensity={8} distance={4} />
      </group>
    </group>
  );
}
