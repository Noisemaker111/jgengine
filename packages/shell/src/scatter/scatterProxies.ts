import * as THREE from "three";

/**
 * Stylized per-species proxy meshes — real, distinct silhouettes (trunked trees, stacked pines, round
 * bushes, faceted rocks, grass tufts) instead of one cone for every item. This is the fallback
 * `InstancedScatter` draws for any species without a `resolveItem` override (or the editor preview,
 * which never resolves a game's catalog); a game wanting real GLBs registers the item in its
 * `resolveItem`/asset catalog instead.
 * @internal
 */

interface ProxyPart {
  geometry: THREE.BufferGeometry;
  color: string;
}

const BARK = "#5b4127";
const LEAF = "#3f6b30";
const PINE = "#2f5330";
const OAK = "#4a7a37";
const BUSH = "#4d7d3a";
const ROCK = "#82858c";
const GRASS = "#5f9a3c";
const PALM_BARK = "#8a7355";
const PALM_FROND = "#4c8b3d";
const CYPRESS = "#31502f";

/** Concatenates part geometries into one vertex-colored buffer (position + normal + color). */
function mergeParts(parts: ProxyPart[]): THREE.BufferGeometry {
  const geos = parts.map((part) => (part.geometry.index === null ? part.geometry : part.geometry.toNonIndexed()));
  let total = 0;
  for (const geo of geos) total += (geo.attributes.position as THREE.BufferAttribute).count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const tint = new THREE.Color();
  let offset = 0;
  for (let i = 0; i < geos.length; i += 1) {
    const geo = geos[i]!;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    position.set(pos.array as Float32Array, offset * 3);
    normal.set(nor.array as Float32Array, offset * 3);
    tint.set(parts[i]!.color);
    for (let v = 0; v < pos.count; v += 1) {
      color[(offset + v) * 3] = tint.r;
      color[(offset + v) * 3 + 1] = tint.g;
      color[(offset + v) * 3 + 2] = tint.b;
    }
    offset += pos.count;
  }
  for (const geo of geos) geo.dispose();
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(color, 3));
  merged.computeBoundingSphere();
  return merged;
}

function trunk(height: number, radius: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius * 0.8, radius, height, 5);
  geo.translate(0, height / 2, 0);
  return geo;
}

function cone(radius: number, height: number, y: number, segments = 7): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, segments);
  geo.translate(0, y + height / 2, 0);
  return geo;
}

function sphere(radius: number, y: number, squash = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  geo.scale(1, squash, 1);
  geo.translate(0, y, 0);
  return geo;
}

const BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  tree: () => mergeParts([
    { geometry: trunk(1.1, 0.12), color: BARK },
    { geometry: cone(0.8, 1.7, 0.9), color: LEAF },
  ]),
  pine: () => mergeParts([
    { geometry: trunk(0.9, 0.1), color: BARK },
    { geometry: cone(0.7, 1.0, 0.7), color: PINE },
    { geometry: cone(0.55, 0.9, 1.35), color: PINE },
    { geometry: cone(0.38, 0.8, 1.95), color: PINE },
  ]),
  oak: () => mergeParts([
    { geometry: trunk(1.0, 0.14), color: BARK },
    { geometry: sphere(0.85, 1.55, 0.85), color: OAK },
  ]),
  bush: () => mergeParts([{ geometry: sphere(0.55, 0.45, 0.8), color: BUSH }]),
  shrub: () => mergeParts([{ geometry: sphere(0.5, 0.4, 0.75), color: BUSH }]),
  rock: () => mergeParts([{ geometry: sphere(0.5, 0.28, 0.7), color: ROCK }]),
  stone: () => mergeParts([{ geometry: sphere(0.4, 0.22, 0.65), color: ROCK }]),
  grass: () => mergeParts([
    { geometry: cone(0.09, 0.7, 0), color: GRASS },
    { geometry: cone(0.08, 0.55, 0).translate(0.12, 0, 0.05), color: GRASS },
    { geometry: cone(0.08, 0.6, 0).translate(-0.1, 0, -0.06), color: GRASS },
  ]),
  palm: () => {
    // Tall bare trunk with a radial crown of drooping fronds — each frond a flattened cone laid
    // near-horizontal, tips sagging below the crown.
    const parts: ProxyPart[] = [{ geometry: trunk(2.6, 0.09), color: PALM_BARK }];
    for (let i = 0; i < 6; i += 1) {
      const yaw = (i / 6) * Math.PI * 2;
      const frond = new THREE.ConeGeometry(0.16, 1.35, 4);
      frond.scale(1, 1, 0.35);
      frond.rotateX(-Math.PI / 2 - 0.5);
      frond.rotateY(yaw);
      frond.translate(Math.sin(yaw) * 0.32, 2.62, Math.cos(yaw) * 0.32);
      parts.push({ geometry: frond, color: PALM_FROND });
    }
    parts.push({ geometry: sphere(0.14, 2.56), color: PALM_BARK });
    return mergeParts(parts);
  },
  cypress: () => mergeParts([
    { geometry: trunk(0.5, 0.07), color: BARK },
    { geometry: cone(0.34, 2.5, 0.35, 6), color: CYPRESS },
    { geometry: cone(0.2, 0.7, 2.75, 5), color: CYPRESS },
  ]),
};

function defaultProxy(): THREE.BufferGeometry {
  return mergeParts([{ geometry: cone(0.35, 1.2, 0), color: GRASS }]);
}

/**
 * Builds the merged proxy geometry for a scatter item id, memoized per builder call by the caller.
 * @internal — the geometry catalog behind the `InstancedScatter` renderer.
 */
export function buildScatterProxy(item: string): THREE.BufferGeometry {
  const builder = BUILDERS[item];
  return builder === undefined ? defaultProxy() : builder();
}
