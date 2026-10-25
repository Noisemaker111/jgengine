import { useAnimations, useGLTF } from "@react-three/drei";
import { PROFILE_SECTION, useProfiledFrame } from "@/runtime/runtimePerformanceProfiler";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { SkeletonUtils } from "three-stdlib";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  MeshStandardMaterial,
  Quaternion,
  type Bone,
  type Group,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from "three";

import {
  CHARACTER_FISH_COLORS,
  CHARACTER_HOODIE_COLORS,
  CHARACTER_PANTS_COLORS,
  CHARACTER_REGION_BASE_COLORS,
  CHARACTER_SHOES_COLORS,
  type CharacterLook,
  DEFAULT_CHARACTER_LOOK,
  VINYL_MATERIAL,
} from "@/user/playerCharacterFigure";

interface PlayerCharacterFigureProps {
  look?: CharacterLook;
  scale?: number;
  /** When true, legs/arms swing through the walk cycle. Idle holds a neutral frame. */
  isWalking?: boolean;
  /** Optional external walk phase in radians to drive sync across clients. */
  walkPhase?: number;
  /** Head look yaw in radians (positive = turn right from model's +Z forward). */
  headYaw?: number;
  /** Head look pitch in radians (positive = look down in camera space). */
  headPitch?: number;
  /** Live head look — read every frame when set (for remote avatar interpolation). */
  headLookRef?: MutableRefObject<{ pitch: number } | null>;
}

const MODEL_URL = "/models/character/player-walk.glb";
const WALK_RATE = 5.5;
const IDLE_TIME = 0;
const RIG_SCALE_FIX = 1;

useGLTF.preload(MODEL_URL);

const REGION = {
  neutral: 0,
  fish: 1,
  hoodie: 2,
  pants: 3,
  shoes: 4,
} as const;
type RegionId = (typeof REGION)[keyof typeof REGION];

const HEAD_BONES = new Set(["Head", "head_end", "headfront"]);
const HAND_BONES = new Set(["LeftHand", "RightHand"]);
const SHOE_BONES = new Set(["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]);
const PANTS_BONES = new Set(["Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]);
const HOODIE_BONES = new Set([
  "Spine",
  "Spine01",
  "Spine02",
  "LeftShoulder",
  "RightShoulder",
  "LeftArm",
  "RightArm",
  "LeftForeArm",
  "RightForeArm",
  "neck",
]);

type TextureSampler = (u: number, v: number) => readonly [number, number, number];

function regionForBone(name: string): RegionId | null {
  if (HAND_BONES.has(name)) return REGION.neutral;
  if (SHOE_BONES.has(name)) return REGION.shoes;
  if (PANTS_BONES.has(name)) return REGION.pants;
  if (HOODIE_BONES.has(name)) return REGION.hoodie;
  if (HEAD_BONES.has(name)) return null;
  return REGION.neutral;
}

function classifyHeadPixel(r: number, g: number, b: number): RegionId {
  if (b > 0.35 && b > r + 0.08) return REGION.fish;
  if (r > 0.42 && r > b + 0.12) return REGION.fish;
  return REGION.neutral;
}

const regionCache = new WeakMap<BufferGeometry, Uint8Array>();

function computeVertexRegions(mesh: SkinnedMesh, sampleTexture?: TextureSampler): Uint8Array {
  const cached = regionCache.get(mesh.geometry);
  if (cached) return cached;

  const boneNames = mesh.skeleton.bones.map((b) => b.name);
  const position = mesh.geometry.attributes.position;
  const uvAttr = mesh.geometry.attributes.uv;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  const count = position.count;
  const regions = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    let bestBone = 0;
    let bestWeight = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w > bestWeight) {
        bestWeight = w;
        bestBone = skinIndex.getComponent(i, k);
      }
    }

    const boneName = boneNames[bestBone] ?? "";
    const boneRegion = regionForBone(boneName);
    if (boneRegion !== null && boneRegion !== REGION.neutral) {
      regions[i] = boneRegion;
      continue;
    }

    if (HEAD_BONES.has(boneName) && sampleTexture && uvAttr) {
      const [r, g, b] = sampleTexture(uvAttr.getX(i), uvAttr.getY(i));
      regions[i] = classifyHeadPixel(r, g, b);
      continue;
    }

    regions[i] = boneRegion ?? REGION.neutral;
  }

  regionCache.set(mesh.geometry, regions);
  return regions;
}

function findSkinnedMesh(root: Object3D): SkinnedMesh | null {
  let found: SkinnedMesh | null = null;
  root.traverse((child) => {
    if (!found && (child as SkinnedMesh).isSkinnedMesh) found = child as SkinnedMesh;
  });
  return found;
}

function readImageDimensions(image: CanvasImageSource): { width: number; height: number } | null {
  if (image instanceof HTMLImageElement) {
    if (image.width === 0) return null;
    return { width: image.width, height: image.height };
  }
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }
  if (image instanceof HTMLCanvasElement || image instanceof OffscreenCanvas) {
    if (image.width === 0) return null;
    return { width: image.width, height: image.height };
  }
  return null;
}

function createTextureSampler(map: Texture): TextureSampler | null {
  const image = map.image as CanvasImageSource | undefined;
  if (!image) return null;
  const dimensions = readImageDimensions(image);
  if (!dimensions) return null;

  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, dimensions.width, dimensions.height).data;

  return (u, v) => {
    const x = Math.min(dimensions.width - 1, Math.max(0, Math.floor(u * dimensions.width)));
    const y = Math.min(dimensions.height - 1, Math.max(0, Math.floor((1 - v) * dimensions.height)));
    const index = (y * dimensions.width + x) * 4;
    return [pixels[index] / 255, pixels[index + 1] / 255, pixels[index + 2] / 255];
  };
}

function colorMultiplier(targetHex: string, baseHex: string): Color {
  const target = new Color(targetHex);
  const base = new Color(baseHex);
  return new Color(
    target.r / Math.max(base.r, 0.001),
    target.g / Math.max(base.g, 0.001),
    target.b / Math.max(base.b, 0.001),
  );
}

const NEUTRAL_MULTIPLIER = new Color(1, 1, 1);

function buildTintedGeometry(mesh: SkinnedMesh, regions: Uint8Array, look: CharacterLook): BufferGeometry {
  const palette: Record<RegionId, Color> = {
    [REGION.neutral]: NEUTRAL_MULTIPLIER,
    [REGION.fish]: colorMultiplier(CHARACTER_FISH_COLORS[look.fish].color, CHARACTER_REGION_BASE_COLORS.fish),
    [REGION.hoodie]: colorMultiplier(CHARACTER_HOODIE_COLORS[look.hoodie].color, CHARACTER_REGION_BASE_COLORS.hoodie),
    [REGION.pants]: colorMultiplier(CHARACTER_PANTS_COLORS[look.pants].color, CHARACTER_REGION_BASE_COLORS.pants),
    [REGION.shoes]: colorMultiplier(CHARACTER_SHOES_COLORS[look.shoes].color, CHARACTER_REGION_BASE_COLORS.shoes),
  };

  const colors = new Float32Array(regions.length * 3);
  for (let i = 0; i < regions.length; i++) {
    const tint = palette[regions[i] as RegionId] ?? NEUTRAL_MULTIPLIER;
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.boundingBox = mesh.geometry.boundingBox;
  geometry.boundingSphere = mesh.geometry.boundingSphere;
  return geometry;
}

const SOLID_TINT_MATERIAL = new MeshStandardMaterial({ vertexColors: true, ...VINYL_MATERIAL });

const lookAtEuler = new Euler();
const lookAtQuat = new Quaternion();

export function PlayerCharacterFigure({
  look = DEFAULT_CHARACTER_LOOK,
  scale = 1,
  isWalking = false,
  walkPhase,
  headYaw = 0,
  headPitch = 0,
  headLookRef,
}: PlayerCharacterFigureProps) {
  const gltf = useGLTF(MODEL_URL);
  const groupRef = useRef<Group>(null);

  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene) as Object3D, [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, groupRef);
  const clip = gltf.animations[0];
  const walkAction = clip ? actions[clip.name] : undefined;

  const skinnedMesh = useMemo(() => findSkinnedMesh(cloned), [cloned]);
  const headBone = useMemo<Bone | null>(
    () => (cloned.getObjectByName("Head") as Bone | undefined) ?? null,
    [cloned],
  );
  const headBindQuat = useMemo(() => headBone?.quaternion.clone() ?? null, [headBone]);

  useEffect(() => {
    if (!walkAction) return;
    walkAction.play();
    walkAction.paused = false;
  }, [walkAction]);

  useEffect(() => {
    if (!skinnedMesh) return;

    const applyTint = () => {
      const sourceMaterial = skinnedMesh.material;
      const standardMaterial = Array.isArray(sourceMaterial)
        ? sourceMaterial.find((entry): entry is MeshStandardMaterial => entry instanceof MeshStandardMaterial)
        : sourceMaterial instanceof MeshStandardMaterial
          ? sourceMaterial
          : null;

      const textureSampler =
        standardMaterial?.map !== null && standardMaterial?.map !== undefined
          ? createTextureSampler(standardMaterial.map)
          : null;
      const regions = computeVertexRegions(skinnedMesh, textureSampler ?? undefined);

      skinnedMesh.geometry = buildTintedGeometry(skinnedMesh, regions, look);
      if (textureSampler !== null && standardMaterial) {
        const tintedMaterial = standardMaterial.clone();
        tintedMaterial.vertexColors = true;
        skinnedMesh.material = tintedMaterial;
      } else {
        skinnedMesh.material = SOLID_TINT_MATERIAL;
      }
      skinnedMesh.castShadow = true;
      skinnedMesh.receiveShadow = true;
    };

    const map = (Array.isArray(skinnedMesh.material) ? skinnedMesh.material[0] : skinnedMesh.material) as MeshStandardMaterial;
    const textureSource = map?.map?.image;
    if (textureSource instanceof HTMLImageElement && !textureSource.complete) {
      textureSource.addEventListener("load", applyTint, { once: true });
      return () => textureSource.removeEventListener("load", applyTint);
    }

    applyTint();
  }, [skinnedMesh, look]);

  useProfiledFrame(PROFILE_SECTION.playerCharacter, (state) => {
    if (walkAction && clip) {
      const phase = walkPhase !== undefined ? walkPhase : state.clock.elapsedTime * WALK_RATE;
      if (isWalking) {
        const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        walkAction.time = (cycle / (Math.PI * 2)) * clip.duration;
      } else {
        walkAction.time = IDLE_TIME;
      }
      walkAction.getMixer().update(0);
    }

    if (headBone && headBindQuat) {
      const pitch = headLookRef?.current?.pitch ?? headPitch;
      lookAtEuler.set(pitch, headYaw, 0, "XYZ");
      lookAtQuat.setFromEuler(lookAtEuler);
      headBone.quaternion.copy(headBindQuat).multiply(lookAtQuat);
    }
  });

  return (
    <group ref={groupRef} scale={scale * RIG_SCALE_FIX}>
      <primitive object={cloned} />
    </group>
  );
}