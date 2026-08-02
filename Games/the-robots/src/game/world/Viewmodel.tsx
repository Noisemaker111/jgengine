import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { useRef, useState } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { WeatherLayer } from "@jgengine/shell/weather";
import { airAt, gust } from "./air";
import { zoneAt } from "./zones";
import { equippedGun, gameNow, muzzleFlashVisible, recoilAt } from "../feel";
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

/**
 * The lit trim colour each brand signs its guns with. The plating hues above are body paint — dark
 * enough to sit under a desert sun without glaring, and therefore too dark to tell apart on a weapon
 * that occupies a hand's width of screen. One saturated emissive line per brand is what actually
 * reads at that size, and it survives the shaded side of the gun where paint does not.
 */
const MANUFACTURER_ACCENTS: Record<string, string> = {
  Blackwood: "#ffae4a",
  Apex: "#eaf2ff",
  Voltek: "#4bb8ff",
  Chuckwerk: "#9ee06a",
  Detonic: "#ff5a2e",
  Ironworks: "#ffc64a",
  Vanguard: "#7fe0c0",
  Scrapjack: "#c98cff",
};

/**
 * Finishes, split by what a part is made of rather than one grey for the whole weapon. Machined
 * steel takes a low roughness and reads by its highlight; polymer takes a high roughness and reads
 * by staying dark, and the value gap between the two is what stops the gun looking like one box.
 *
 * `emissive` here is not a light source — it stands in for the image-based lighting this scene does
 * not have. A first-person weapon sits half a metre from the eye, mostly turned away from the key,
 * and a PBR metal with no environment map has almost no diffuse term, so an honest receiver renders
 * as a black cut-out against bright sand. A small self-lit floor per part gives the metal its own
 * ambient and keeps the machined/polymer split legible in shade.
 */
const FINISH = {
  /** Receiver and frame: machined, mid-value, the part the silhouette is made of. */
  receiver: { color: "#59616a", metalness: 0.45, roughness: 0.36, emissive: "#39424c", emissiveIntensity: 0.35 },
  /** Rail, bolt, muzzle collar: polished steel highlights that draw the top edge of the silhouette. */
  bright: { color: "#aeb7bf", metalness: 0.72, roughness: 0.18, emissive: "#5d6873", emissiveIntensity: 0.25 },
  /** Blued barrel — darker than the receiver so the bore end reads as a separate part. */
  barrel: { color: "#454d55", metalness: 0.82, roughness: 0.24, emissive: "#252c34", emissiveIntensity: 0.35 },
  /** Grip, magazine, optic body, foregrip: moulded polymer, matte and near-black. */
  polymer: { color: "#1e2228", metalness: 0.04, roughness: 0.86, emissive: "#12161b", emissiveIntensity: 0.35 },
} as const;

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

/** Barrel-shroud vent slots, spaced along whatever barrel the family actually has. */
function BarrelVents({ barrelR, barrelZ, barrelL, y }: { barrelR: number; barrelZ: number; barrelL: number; y: number }) {
  const slots = barrelL < 0.16 ? 2 : 3;
  const step = (barrelL * 0.6) / slots;
  return (
    <>
      {Array.from({ length: slots }, (_, index) => (
        <mesh key={index} position={[0, y + barrelR * 0.9, barrelZ + barrelL * 0.24 - index * step]}>
          <boxGeometry args={[barrelR * 2.3, barrelR * 0.5, barrelR * 0.6]} />
          <meshStandardMaterial {...FINISH.polymer} />
        </mesh>
      ))}
    </>
  );
}

function GunMesh({ gun }: { gun: GunDef }) {
  const spec = FAMILY_BLASTER[gun.family];
  const plating = MANUFACTURER_COLORS[gun.manufacturer] ?? "#7a6a58";
  const accent = MANUFACTURER_ACCENTS[gun.manufacturer] ?? "#ffb400";
  const glow = gun.element !== "none" ? ELEMENT_COLORS[gun.element] : null;
  const [bodyW, bodyH, bodyL] = spec.body;
  const [barrelR, barrelL] = spec.barrel;
  const barrelZ = -(bodyL / 2 + barrelL / 2);
  const barrelY = bodyH * 0.16;
  const braced = spec.optic !== null;

  return (
    <group rotation={[0, Math.PI, 0]} position={[0, -0.02, -0.1]}>
      {/* Receiver */}
      <mesh castShadow={false}>
        <boxGeometry args={[bodyW, bodyH, bodyL]} />
        <meshStandardMaterial {...FINISH.receiver} />
      </mesh>
      {/* Polished top rail. The one part that always catches the sky, so the weapon has a lit upper
          edge instead of ending in a flat dark boundary against bright sand. */}
      <mesh position={[0, bodyH / 2 + 0.004, -bodyL * 0.04]}>
        <boxGeometry args={[bodyW * 0.5, 0.008, bodyL * 0.82]} />
        <meshStandardMaterial {...FINISH.bright} />
      </mesh>
      {/* Manufacturer plating along the receiver flank — where the brand colour reads. */}
      <mesh position={[bodyW / 2 + 0.004, bodyH * 0.1, 0]}>
        <boxGeometry args={[0.008, bodyH * 0.55, bodyL * 0.7]} />
        <meshStandardMaterial color={plating} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[-(bodyW / 2 + 0.004), bodyH * 0.1, 0]}>
        <boxGeometry args={[0.008, bodyH * 0.55, bodyL * 0.7]} />
        <meshStandardMaterial color={plating} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Brand accent line, both flanks, riding the bottom of the plating. */}
      <mesh position={[bodyW / 2 + 0.009, -bodyH * 0.1, 0]}>
        <boxGeometry args={[0.004, bodyH * 0.1, bodyL * 0.58]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} roughness={0.35} />
      </mesh>
      <mesh position={[-(bodyW / 2 + 0.009), -bodyH * 0.1, 0]}>
        <boxGeometry args={[0.004, bodyH * 0.1, bodyL * 0.58]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} roughness={0.35} />
      </mesh>
      {/* Ejection port and charging handle — small asymmetries that stop the flank reading as a slab. */}
      <mesh position={[bodyW / 2 + 0.005, bodyH * 0.18, -bodyL * 0.1]}>
        <boxGeometry args={[0.007, bodyH * 0.24, bodyL * 0.2]} />
        <meshStandardMaterial {...FINISH.polymer} />
      </mesh>
      <mesh position={[bodyW / 2 + 0.014, bodyH * 0.3, bodyL * 0.16]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.03, 8]} />
        <meshStandardMaterial {...FINISH.bright} />
      </mesh>
      {/* Barrel */}
      <mesh position={[0, barrelY, barrelZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[barrelR, barrelR, barrelL, 12]} />
        <meshStandardMaterial {...FINISH.barrel} />
      </mesh>
      <BarrelVents barrelR={barrelR} barrelZ={barrelZ} barrelL={barrelL} y={barrelY} />
      {/* Muzzle collar: a bright ring at the bore so the far end of the silhouette resolves. */}
      <mesh position={[0, barrelY, barrelZ - barrelL / 2 + 0.008]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[barrelR * 1.25, barrelR * 1.25, 0.016, 12]} />
        <meshStandardMaterial {...FINISH.bright} />
      </mesh>
      {spec.brake === null ? null : (
        <mesh position={[0, barrelY, barrelZ - barrelL / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[spec.brake, barrelR * 1.2, 0.045, 12]} />
          <meshStandardMaterial {...FINISH.barrel} />
        </mesh>
      )}
      {/* Grip, angled back into the palm. */}
      <mesh position={[0, -(bodyH * 0.62), bodyL * 0.3]} rotation={[0.32, 0, 0]}>
        <boxGeometry args={[bodyW * 0.8, bodyH * 0.9, bodyL * 0.22]} />
        <meshStandardMaterial {...FINISH.polymer} />
      </mesh>
      {/* Trigger guard — a hoop of daylight under the receiver reads as a real weapon, not a block. */}
      <mesh position={[0, -(bodyH * 0.5), bodyL * 0.16]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[bodyH * 0.24, 0.005, 6, 14]} />
        <meshStandardMaterial {...FINISH.receiver} />
      </mesh>
      {/* Braced families get a foregrip; it is the silhouette difference between a rifle and a pistol. */}
      {braced ? (
        <mesh position={[0, barrelY - barrelR - 0.028, barrelZ + barrelL * 0.18]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[bodyW * 0.55, 0.055, bodyL * 0.13]} />
          <meshStandardMaterial {...FINISH.polymer} />
        </mesh>
      ) : null}
      {spec.magazine === null ? null : (
        <mesh position={[0, -(bodyH / 2 + spec.magazine[1] / 2), -bodyL * 0.08]}>
          <boxGeometry args={spec.magazine as unknown as [number, number, number]} />
          <meshStandardMaterial {...FINISH.polymer} />
        </mesh>
      )}
      {spec.optic === null ? null : (
        <>
          <mesh position={[0, bodyH / 2 + spec.optic[1] / 2 + 0.006, bodyL * 0.05]}>
            <boxGeometry args={spec.optic as unknown as [number, number, number]} />
            <meshStandardMaterial {...FINISH.polymer} />
          </mesh>
          {/* Lit optic lens — the same cold cyan the machines' optics use, so player and enemy read
              as the same technology. */}
          <mesh
            position={[0, bodyH / 2 + spec.optic[1] / 2 + 0.006, bodyL * 0.05 - spec.optic[2] / 2 - 0.002]}
            rotation={[0, Math.PI, 0]}
          >
            <circleGeometry args={[spec.optic[1] * 0.42, 12]} />
            <meshStandardMaterial color="#3fd8ff" emissive="#3fd8ff" emissiveIntensity={2.2} roughness={0.2} />
          </mesh>
        </>
      )}
      {/* Iron sights when there is no optic, so every family has something above the bore line. */}
      {spec.optic === null ? (
        <>
          <mesh position={[0, bodyH / 2 + 0.012, -bodyL * 0.4]}>
            <boxGeometry args={[0.005, 0.016, 0.005]} />
            <meshStandardMaterial {...FINISH.bright} />
          </mesh>
          <mesh position={[0, bodyH / 2 + 0.011, bodyL * 0.36]}>
            <boxGeometry args={[0.018, 0.012, 0.005]} />
            <meshStandardMaterial {...FINISH.bright} />
          </mesh>
        </>
      ) : null}
      {/* Element charge cell: the loudest emissive on the gun, so the element read comes off the
          weapon itself rather than only off the HUD card. */}
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
        // Grit, not weather. At the old opacity and size the motes that happened to sit above the
        // camera projected onto the sky as discrete bright dots — read as render noise, or snow, not
        // as dusty air. Small and faint is what makes a mote read as suspended dust.
        opacity: 0.1 + blow * 0.14,
        size: 0.11,
        speed: 1.6 + blow * 3.2,
        // Tighter than the default volume so the motes concentrate in the near field where the
        // parallax actually reads, instead of thinning out across 70 m of empty air. The 15 m column
        // put a third of the field above eye level; blown sand does not hang at rooftop height in
        // still air, and against an open sky every mote up there was a speck with nothing behind it.
        volume: [44, 5, 44],
        // Packs the field into the metre either side of the ground plane, where wind-carried grit
        // actually lives and where there is terrain behind it to read against. A 5 m column also
        // puts the layer's own top fade below eye level, so the few motes that do ride high are
        // already fading out rather than popping against open sky.
        groundBias: 0.92,
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

    const recoil = recoilAt(nowMs);

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
      const visible = muzzleFlashVisible(nowMs);
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
          <planeGeometry args={[0.11, 0.11]} />
          <meshBasicMaterial color="#ffd76a" transparent opacity={0.9} depthWrite={false} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.11, 0.11]} />
          <meshBasicMaterial color="#ff9a3e" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        <pointLight color="#ffb347" intensity={5} distance={3} />
      </group>
    </group>
  );
}
