import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Color, Group, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cloneModelScene, disposeClonedMaterials } from "@jgengine/shell/render/modelRender";
import { assets } from "../assets";
import { equippedGun, gameNow, lastShot } from "../feel";
import { gunById, magState, type GunDef, type GunFamily } from "../handroll";
import { ELEMENT_COLORS } from "../palette";

const FAMILY_MUZZLE_Z: Record<GunFamily, number> = {
  pistol: 0.32,
  smg: 0.42,
  shotgun: 0.5,
  rifle: 0.52,
  sniper: 0.62,
  launcher: 0.56,
};

/** Preferred KayKit / scifi weapon ids — soft-resolve; missing → box primitive. */
const FAMILY_BLASTER: Record<GunFamily, { model: string; fallbackModel?: string }> = {
  pistol: { model: "kaykit-adventurers/dagger", fallbackModel: "kaykit-adventurers/wand" },
  smg: { model: "kaykit-adventurers/crossbow_1handed", fallbackModel: "kaykit-adventurers/sword_1handed" },
  shotgun: { model: "kaykit-adventurers/axe_2handed", fallbackModel: "kaykit-adventurers/sword_2handed" },
  rifle: { model: "kaykit-adventurers/crossbow_2handed", fallbackModel: "kaykit-adventurers/staff" },
  sniper: { model: "kaykit-adventurers/staff", fallbackModel: "kaykit-adventurers/wand" },
  launcher: { model: "kaykit-adventurers/axe_1handed", fallbackModel: "kaykit-adventurers/sword_2handed" },
};

const FAMILY_SCALE: Record<GunFamily, number> = {
  pistol: 0.6,
  smg: 0.44,
  shotgun: 0.62,
  rifle: 0.6,
  sniper: 0.52,
  launcher: 0.58,
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

function resolveBlasterUrl(family: GunFamily): string | null {
  const pick = FAMILY_BLASTER[family];
  for (const id of [pick.model, pick.fallbackModel]) {
    if (id === undefined) continue;
    const url = assets.resolve(id)?.url;
    if (url !== undefined) return url;
  }
  return null;
}

function tintScene(scene: Object3D, body: string, glow: string | null): void {
  const bodyColor = new Color(body);
  const glowColor = glow === null ? null : new Color(glow);
  scene.traverse((node) => {
    const mesh = node as { isMesh?: boolean; material?: unknown };
    if (mesh.isMesh !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.lerp(bodyColor, 0.55);
      material.metalness = 0.65;
      material.roughness = 0.42;
      if (glowColor !== null) {
        material.emissive.copy(glowColor);
        material.emissiveIntensity = 0.35;
      }
    }
  });
}

function GunMesh({ gun }: { gun: GunDef }) {
  const url = resolveBlasterUrl(gun.family);
  const body = MANUFACTURER_COLORS[gun.manufacturer] ?? "#7a6a58";
  const glow = gun.element !== "none" ? ELEMENT_COLORS[gun.element] : null;
  const scale = FAMILY_SCALE[gun.family];

  if (url === null) {
    return (
      <mesh rotation={[0, Math.PI, 0]} scale={scale} position={[0, -0.02, -0.1]}>
        <boxGeometry args={[0.08, 0.12, 0.35]} />
        <meshStandardMaterial
          color={body}
          metalness={0.65}
          roughness={0.42}
          emissive={glow ?? "#000000"}
          emissiveIntensity={glow === null ? 0 : 0.35}
        />
      </mesh>
    );
  }

  return <GunGlb url={url} body={body} glow={glow} scale={scale} />;
}

function GunGlb({
  url,
  body,
  glow,
  scale,
}: {
  url: string;
  body: string;
  glow: string | null;
  scale: number;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => {
    const cloned = cloneModelScene(gltf.scene);
    tintScene(cloned, body, glow);
    return cloned;
  }, [gltf, body, glow]);
  useEffect(() => () => disposeClonedMaterials(scene), [scene]);
  return (
    <group rotation={[0, Math.PI, 0]} scale={scale} position={[0, -0.02, -0.1]}>
      <primitive object={scene} />
    </group>
  );
}

export function FerralonWorldOverlay() {
  return <FerralonViewmodel />;
}

export function FerralonViewmodel() {
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
    if (gun !== undefined && magState(gun).reloadingUntilMs > nowMs) {
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
  const muzzleZ = -FAMILY_MUZZLE_Z[gun.family];
  return (
    <group ref={rig} renderOrder={999}>
      <Suspense fallback={null}>
        <GunMesh gun={gun} />
      </Suspense>
      <group ref={flash} position={[0, -0.005, muzzleZ]} visible={false}>
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
