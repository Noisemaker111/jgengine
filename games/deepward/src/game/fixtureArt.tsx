import { Suspense, useEffect, useMemo } from "react";
import { BoxGeometry, BufferGeometry, CapsuleGeometry, CatmullRomCurve3, CylinderGeometry, LatheGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AuthoredSurfaceMaterial } from "@jgengine/shell/render/authoredSurfaceMaterial";
import { librarySurface } from "./interiorLook";

/**
 * Modelled station fixtures that used to be stacked primitives: the pressure suits on their service
 * stands and the shift lockers on receiving. Each one is a few merged meshes in scanned finishes, so
 * a fixture costs two to four draws however much detail it carries.
 */

type Part = BufferGeometry;
const at = (geometry: Part, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Part => {
  geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz);
  return geometry.translate(x, y, z);
};
/** Merge parts that all share one finish; every part is flattened to non-indexed so lathe, tube and box can mix. */
function merged(parts: Part[]): BufferGeometry {
  const ready = parts.map(part => {
    const geometry = part.index === null ? part : part.toNonIndexed();
    geometry.deleteAttribute("uv1");
    return geometry;
  });
  const geometry = mergeGeometries(ready, false);
  if (geometry === null) throw new Error("Deepward: fixture parts do not merge");
  geometry.computeBoundingSphere();
  return geometry;
}
const lathe = (profile: [number, number][], segments = 20) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
const limb = (points: [number, number, number][], radius: number) => new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), 16, radius, 10, false);

function useGeometry(build: () => BufferGeometry, deps: unknown[]): BufferGeometry {
  const geometry = useMemo(build, deps);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

const SUIT_STEEL = librarySurface("metal/steel", "#59615f");
const SUIT_BRASS = librarySurface("metal/chipped", "#b48a4e", { metalness: 0.75, roughness: 0.4 });
const VISOR = { color: "#1c3236", roughness: 0.04, metalness: 0.55, emissive: "#0d2a2c", emissiveIntensity: 0.6 };

/**
 * A heavy diving suit left hanging on its service stand: round steel foot plate and post, canvas suit
 * with stitched seams (torso, arms bent at the elbow, legs into weighted boots), brass collar and
 * three-port helmet, air tanks on the back.
 */
export function SuitStand({ canvas }: { canvas: string }) {
  const cloth = useMemo(() => librarySurface("fabric/canvas", canvas), [canvas]);
  const suit = useGeometry(() => merged([
    at(lathe([[0, 0], [0.2, 0.02], [0.27, 0.18], [0.3, 0.42], [0.29, 0.6], [0.25, 0.7], [0.12, 0.74], [0, 0.74]]), 0, 0.96, 0),
    at(lathe([[0, 0], [0.22, 0], [0.24, 0.1], [0.21, 0.18], [0, 0.2]]), 0, 0.82, 0),
    ...[-1, 1].flatMap(side => [
      limb([[side * 0.24, 1.6, 0], [side * 0.33, 1.4, 0.02], [side * 0.35, 1.17, 0.06], [side * 0.31, 0.99, 0.18]], 0.08),
      at(new SphereGeometry(0.075, 10, 8), side * 0.3, 0.95, 0.21),
      limb([[side * 0.12, 0.9, 0], [side * 0.14, 0.62, 0.02], [side * 0.14, 0.3, 0]], 0.1),
    ]),
  ]), []);
  const metal = useGeometry(() => merged([
    at(lathe([[0, 0], [0.46, 0], [0.48, 0.04], [0.46, 0.08], [0, 0.08]], 28), 0, 0, 0),
    at(new CylinderGeometry(0.035, 0.045, 1.0, 10), 0, 0.55, -0.2),
    at(new BoxGeometry(0.62, 0.05, 0.06), 0, 1.56, -0.2),
    ...[-1, 1].flatMap(side => [
      at(lathe([[0, 0], [0.12, 0], [0.13, 0.05], [0.11, 0.16], [0, 0.17]]), side * 0.14, 0.08, 0.03),
      at(new CylinderGeometry(0.075, 0.075, 0.62, 14), side * 0.11, 1.28, -0.34),
      at(new SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), side * 0.11, 1.59, -0.34),
    ]),
  ]), []);
  const brass = useGeometry(() => merged([
    at(new TorusGeometry(0.22, 0.04, 8, 28), 0, 1.7, 0, Math.PI / 2),
    at(lathe([[0.24, 0], [0.27, 0.1], [0.27, 0.3], [0.22, 0.44], [0.12, 0.52], [0, 0.54]], 24), 0, 1.72, 0),
    ...[[0, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0]].map(([turn]) => at(new TorusGeometry(0.085, 0.022, 6, 18), Math.sin(turn!) * 0.265, 1.92, Math.cos(turn!) * 0.265, 0, turn!)),
    ...Array.from({ length: 8 }, (_, i) => at(new SphereGeometry(0.018, 6, 4), Math.cos(i / 8 * Math.PI * 2) * 0.25, 1.74, Math.sin(i / 8 * Math.PI * 2) * 0.25)),
  ]), []);
  const visor = useGeometry(() => merged([[0, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0]].map(([turn]) =>
    at(new CylinderGeometry(0.075, 0.075, 0.03, 16), Math.sin(turn!) * 0.272, 1.92, Math.cos(turn!) * 0.268, Math.PI / 2, turn!))), []);
  return <Suspense fallback={null}>
    <mesh geometry={suit} castShadow receiveShadow><AuthoredSurfaceMaterial surface={cloth} /></mesh>
    <mesh geometry={metal} castShadow receiveShadow><AuthoredSurfaceMaterial surface={SUIT_STEEL} shape="cylinder" /></mesh>
    <mesh geometry={brass} castShadow><AuthoredSurfaceMaterial surface={SUIT_BRASS} shape="cylinder" /></mesh>
    <mesh geometry={visor}><meshStandardMaterial {...VISOR} /></mesh>
  </Suspense>;
}

const LOCKER_PAINT = librarySurface("metal/painted", "#55705f");
const LOCKER_STEEL = librarySurface("metal/steel", "#8e9690");
/**
 * A shift crew locker, 0.8 by 2.2 by 0.7: a painted steel carcass on a kick plinth, two tall doors with
 * vent louvres and a reveal between them, steel handles, hinges and a hasp. `ajar` swings the right
 * door open a crack, so a bank of them never reads as one cloned box.
 */
export function ShiftLocker({ ajar = 0 }: { ajar?: number }) {
  const body = useGeometry(() => merged([
    at(new BoxGeometry(0.8, 2.06, 0.66), 0, 1.13, -0.02),
    at(new BoxGeometry(0.76, 0.1, 0.62), 0, 0.05, -0.04),
    at(new BoxGeometry(0.84, 0.04, 0.7), 0, 2.18, -0.02),
    at(new BoxGeometry(0.385, 1.96, 0.025), -0.2, 1.13, 0.32),
    ...[0.42, 1.7].flatMap(y => Array.from({ length: 5 }, (_, i) => at(new BoxGeometry(0.26, 0.018, 0.03), -0.2, y + i * 0.045, 0.335, -0.5))),
  ]), []);
  const door = useGeometry(() => merged([
    at(new BoxGeometry(0.385, 1.96, 0.025), 0.1925, 0, 0),
    ...[-0.71, 0.57].flatMap(y => Array.from({ length: 5 }, (_, i) => at(new BoxGeometry(0.26, 0.018, 0.03), 0.1925, y + i * 0.045, 0.015, -0.5))),
  ]), []);
  const steel = useGeometry(() => merged([
    at(new BoxGeometry(0.03, 0.22, 0.04), -0.04, 1.2, 0.35),
    at(new BoxGeometry(0.05, 0.05, 0.03), 0, 1.38, 0.345),
    ...[0.4, 1.86].map(y => at(new CylinderGeometry(0.012, 0.012, 0.1, 6), -0.39, y, 0.33)),
    ...[-0.3, 0.3].map(x => at(new BoxGeometry(0.06, 0.06, 0.6), x, 0.0, -0.04)),
  ]), []);
  const handle = useGeometry(() => at(new BoxGeometry(0.03, 0.22, 0.04), 0.33, 0, 0.035), []);
  return <Suspense fallback={null}>
    <mesh geometry={body} castShadow receiveShadow><AuthoredSurfaceMaterial surface={LOCKER_PAINT} /></mesh>
    <group position={[0.0075, 1.13, 0.32]}>
      <group position={[0.385, 0, 0]} rotation-y={ajar}>
        <group position={[-0.385, 0, 0]}>
          <mesh geometry={door} castShadow receiveShadow><AuthoredSurfaceMaterial surface={LOCKER_PAINT} /></mesh>
          <mesh geometry={handle} castShadow><AuthoredSurfaceMaterial surface={LOCKER_STEEL} /></mesh>
        </group>
      </group>
    </group>
    <mesh geometry={steel} castShadow><AuthoredSurfaceMaterial surface={LOCKER_STEEL} /></mesh>
  </Suspense>;
}
