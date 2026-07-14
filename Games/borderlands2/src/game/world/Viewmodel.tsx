import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BackSide, Color, Group, ShaderMaterial, Vector3 } from "three";
import { equippedGun, gameNow, lastShot } from "../feel";
import { gunById, magState, type GunDef, type GunFamily } from "../handroll";
import { ELEMENT_COLORS, RARITY_COLORS } from "../palette";

const FAMILY_SHAPE: Record<GunFamily, { barrelLen: number; barrelR: number; bodyLen: number; bodyH: number; magH: number; scopeH: number }> = {
  pistol: { barrelLen: 0.22, barrelR: 0.022, bodyLen: 0.2, bodyH: 0.1, magH: 0.1, scopeH: 0 },
  smg: { barrelLen: 0.26, barrelR: 0.02, bodyLen: 0.3, bodyH: 0.11, magH: 0.16, scopeH: 0.03 },
  shotgun: { barrelLen: 0.42, barrelR: 0.035, bodyLen: 0.3, bodyH: 0.12, magH: 0.05, scopeH: 0 },
  rifle: { barrelLen: 0.4, barrelR: 0.024, bodyLen: 0.34, bodyH: 0.12, magH: 0.17, scopeH: 0.04 },
  sniper: { barrelLen: 0.58, barrelR: 0.02, bodyLen: 0.32, bodyH: 0.11, magH: 0.1, scopeH: 0.07 },
  launcher: { barrelLen: 0.5, barrelR: 0.07, bodyLen: 0.3, bodyH: 0.16, magH: 0.08, scopeH: 0.05 },
};

const MANUFACTURER_COLORS: Record<string, string> = {
  Jakobs: "#6e4a2c",
  Hyperion: "#c9c4b8",
  Maliwan: "#2c4a6e",
  Tediore: "#5a6a5e",
  Torgue: "#7a2c1e",
  Vladof: "#5e3a2c",
  Dahl: "#4e5a3c",
  Bandit: "#5a5248",
};

function GunMesh({ gun }: { gun: GunDef }) {
  const shape = FAMILY_SHAPE[gun.family];
  const body = MANUFACTURER_COLORS[gun.manufacturer] ?? "#3a4048";
  const accent = RARITY_COLORS[gun.rarity];
  const glow = gun.element !== "none" ? ELEMENT_COLORS[gun.element] : null;
  return (
    <group>
      <mesh position={[0, 0, -(shape.bodyLen / 2)]}>
        <boxGeometry args={[0.075, shape.bodyH, shape.bodyLen]} />
        <meshStandardMaterial color={body} flatShading />
      </mesh>
      <mesh position={[0, -0.005, -(shape.bodyLen + shape.barrelLen / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[shape.barrelR, shape.barrelR * 1.15, shape.barrelLen, 8]} />
        <meshStandardMaterial color="#22262c" flatShading />
      </mesh>
      <mesh position={[0, -(shape.bodyH / 2 + 0.05), -0.06]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.06]} />
        <meshStandardMaterial color="#2c2620" flatShading />
      </mesh>
      {shape.magH > 0 ? (
        <mesh position={[0, -(shape.bodyH / 2 + shape.magH / 2), -(shape.bodyLen * 0.72)]}>
          <boxGeometry args={[0.05, shape.magH, 0.07]} />
          <meshStandardMaterial color="#33373f" flatShading />
        </mesh>
      ) : null}
      {shape.scopeH > 0 ? (
        <mesh position={[0, shape.bodyH / 2 + shape.scopeH, -(shape.bodyLen * 0.6)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
          <meshStandardMaterial color="#171a1f" flatShading />
        </mesh>
      ) : null}
      <mesh position={[0.04, 0, -(shape.bodyLen * 0.55)]}>
        <boxGeometry args={[0.008, shape.bodyH * 0.55, shape.bodyLen * 0.5]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} />
      </mesh>
      {glow !== null ? (
        <mesh position={[0, shape.bodyH / 2 + 0.012, -(shape.bodyLen * 0.3)]}>
          <boxGeometry args={[0.03, 0.012, 0.08]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.6} />
        </mesh>
      ) : null}
    </group>
  );
}

const SKY_VERTEX = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = `
varying vec3 vWorld;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
void main() {
  vec3 dir = normalize(vWorld - vec3(0.0, -60.0, 0.0));
  float h = dir.y;
  float t = clamp(h * 1.5, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.55));
  float haze = smoothstep(0.22, 0.0, h);
  col = mix(col, uHaze, haze * 0.65);
  float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), 320.0);
  float glow = pow(max(dot(dir, normalize(uSunDir)), 0.0), 10.0);
  col += uSunColor * (sun * 1.2 + glow * 0.22);
  gl_FragColor = vec4(col, 1.0);
}
`;

function PandoraSkyDome() {
  const material = useMemo(() => {
    const shader = new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: new Color("#6f9cbb") },
        uHorizon: { value: new Color("#e8c98f") },
        uHaze: { value: new Color("#d8ac74") },
        uSunDir: { value: new Vector3(0.55, 0.62, 0.32) },
        uSunColor: { value: new Color("#fff0cf") },
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    return shader;
  }, []);
  return (
    <mesh material={material} position={[0, -60, 0]} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[2600, 32, 16]} />
    </mesh>
  );
}

export function PandoraWorldOverlay() {
  return (
    <>
      <PandoraSkyDome />
      <PandoraViewmodel />
    </>
  );
}

export function PandoraViewmodel() {
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
  const shape = FAMILY_SHAPE[gun.family];
  const muzzleZ = -(shape.bodyLen + shape.barrelLen + 0.03);
  return (
    <group ref={rig} renderOrder={999}>
      <GunMesh gun={gun} />
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
