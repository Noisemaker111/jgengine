import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import type { RocketboxClip } from "./catalogs/modelLibrary";
import { retargetClipByRest, type RetargetBone, type RetargetOptions } from "./clipRetarget";
import { gitBlobSha } from "./imageCodec";
import { MAKEHUMAN_REVISION } from "./library/librarySources";
import { installFileReader, loadRocketboxClip } from "./rocketboxPull";

/**
 * MakeHuman (CC0 assets since September 2020) builds people from one base mesh and a library of
 * morph targets. This plays MakeHuman's export in Bun: it reads the base mesh, the ethnicity, age and
 * body targets, the default skeleton, its weights and the eye proxy at a pinned commit (each file
 * checked against Git's blob hash), sums the targets a preset names, places every joint from the
 * morphed mesh, skins the body, and bakes Rocketbox idle, walk and run clips onto it with a
 * rest-aligned retarget. The result is one meshopt GLB in metres, standing on y = 0, facing +Z.
 */

/** The MakeHuman commit every file is read from, so a build is reproducible. */
export const MAKEHUMAN_COMMIT = MAKEHUMAN_REVISION;
const MAKEHUMAN_TREE = `https://api.github.com/repos/makehumancommunity/makehuman/git/trees/${MAKEHUMAN_COMMIT}?recursive=1`;
const MAKEHUMAN_RAW = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${MAKEHUMAN_COMMIT}/makehuman/data`;
const MAKEHUMAN_HOSTS = new Set(["api.github.com", "raw.githubusercontent.com"]);

/** Ethnic mix of a MakeHuman body; MakeHuman normalises the three to sum to 1. */
export interface MakeHumanEthnicity {
  african: number;
  asian: number;
  caucasian: number;
}

/** One pinned MakeHuman person: the macro settings MakeHuman's sliders would hold. */
export interface MakeHumanPreset {
  /** Library id and output folder (`female-young-caucasian`). */
  id: string;
  title: string;
  gender: "female" | "male";
  /** 0 is a 25-year-old adult (MakeHuman's "young"), 1 is 90 ("old"). */
  age: number;
  ethnicity: MakeHumanEthnicity;
  /** MakeHuman's muscle and weight extremes, `average` when absent. */
  muscle?: "min" | "max";
  weight?: "min" | "max";
  tags: readonly string[];
}

/** Settings for {@link pullMakeHumanCharacter}. */
export interface PullMakeHumanOptions {
  /** The folder `model.glb` is written into. */
  outDir: string;
  fetchImpl?: typeof fetch;
  githubToken?: string | undefined;
}

/** What one MakeHuman build wrote. */
export interface PulledMakeHuman {
  id: string;
  file: string;
  bytes: number;
  triangles: number;
  bones: number;
  clips: readonly string[];
  /** Standing height in metres. */
  height: number;
}

class MakeHumanSource {
  private tree: Map<string, string> | undefined;

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly token: string | undefined,
  ) {}

  private async get(url: string, init?: RequestInit): Promise<Response> {
    const host = new URL(url).hostname;
    if (!MAKEHUMAN_HOSTS.has(host)) throw new Error(`refusing a MakeHuman file served from ${host}`);
    const response = await this.fetchImpl(url, init);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response;
  }

  private async shas(): Promise<Map<string, string>> {
    if (this.tree !== undefined) return this.tree;
    const headers: Record<string, string> = { accept: "application/vnd.github+json" };
    if (this.token !== undefined) headers["authorization"] = `Bearer ${this.token}`;
    const body: unknown = await (await this.get(MAKEHUMAN_TREE, { headers })).json();
    const entries = typeof body === "object" && body !== null && "tree" in body && Array.isArray(body.tree) ? body.tree : [];
    this.tree = new Map(
      entries.flatMap((entry: unknown): [string, string][] => {
        const { path, sha } = record(entry);
        return typeof path === "string" && typeof sha === "string" ? [[path, sha]] : [];
      }),
    );
    return this.tree;
  }

  /** One data file's bytes, checked against the blob hash the pinned tree names. */
  async bytes(path: string): Promise<Uint8Array> {
    const expected = (await this.shas()).get(`makehuman/data/${path}`);
    if (expected === undefined) throw new Error(`MakeHuman has no data/${path} at ${MAKEHUMAN_COMMIT}`);
    const bytes = new Uint8Array(await (await this.get(`${MAKEHUMAN_RAW}/${path}`)).arrayBuffer());
    const sha = gitBlobSha(bytes);
    if (sha !== expected) throw new Error(`data/${path}: blob ${sha} does not match the repository's ${expected}`);
    return bytes;
  }

  async text(path: string): Promise<string> {
    return new TextDecoder().decode(await this.bytes(path));
  }

  async json(path: string): Promise<unknown> {
    return JSON.parse(await this.text(path));
  }
}

/** A parsed Wavefront OBJ: positions, UVs and faces (vertex/uv index pairs) by group. */
interface ObjMesh {
  positions: number[];
  uvs: number[];
  faces: { group: string; verts: number[]; uvs: number[] }[];
}

/** @internal */
export function parseObj(text: string): ObjMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const faces: ObjMesh["faces"] = [];
  let group = "";
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    const head = parts[0];
    if (head === "v") positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    else if (head === "vt") uvs.push(Number(parts[1]), Number(parts[2]));
    else if (head === "g") group = parts[1] ?? "";
    else if (head === "f") {
      const verts: number[] = [];
      const faceUvs: number[] = [];
      for (const corner of parts.slice(1)) {
        const [v, vt] = corner.split("/");
        verts.push(Number(v) - 1);
        faceUvs.push(vt === undefined || vt === "" ? -1 : Number(vt) - 1);
      }
      faces.push({ group, verts, uvs: faceUvs });
    }
  }
  return { positions, uvs, faces };
}

/** Adds a `.target` file (`index dx dy dz` lines) into `positions`, scaled by `weight`. @internal */
export function applyTarget(positions: Float32Array, text: string, weight: number): void {
  if (weight === 0) return;
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const index = Number(parts[0]) * 3;
    if (!(index >= 0 && index + 2 < positions.length)) continue;
    positions[index] = (positions[index] ?? 0) + Number(parts[1]) * weight;
    positions[index + 1] = (positions[index + 1] ?? 0) + Number(parts[2]) * weight;
    positions[index + 2] = (positions[index + 2] ?? 0) + Number(parts[3]) * weight;
  }
}

/**
 * The macro targets and weights MakeHuman sums for a preset: each ethnicity's gender-age target
 * (young and old blended by age) and the universal muscle/weight target when either is not average.
 * @internal
 */
export function makehumanTargets(preset: MakeHumanPreset): { path: string; weight: number }[] {
  const total = preset.ethnicity.african + preset.ethnicity.asian + preset.ethnicity.caucasian;
  if (!(total > 0)) throw new Error(`${preset.id}: ethnicity weights sum to zero`);
  const age = Math.min(1, Math.max(0, preset.age));
  const ages: [string, number][] = [
    ["young", 1 - age],
    ["old", age],
  ];
  const out: { path: string; weight: number }[] = [];
  for (const race of ["african", "asian", "caucasian"] as const) {
    const share = preset.ethnicity[race] / total;
    for (const [band, weight] of ages) {
      if (share * weight > 0) out.push({ path: `targets/macrodetails/${race}-${preset.gender}-${band}.target`, weight: share * weight });
    }
  }
  const muscle = `${preset.muscle ?? "average"}muscle`;
  const bodyWeight = `${preset.weight ?? "average"}weight`;
  if (muscle !== "averagemuscle" || bodyWeight !== "averageweight") {
    for (const [band, weight] of ages) {
      if (weight > 0) out.push({ path: `targets/macrodetails/universal-${preset.gender}-${band}-${muscle}-${bodyWeight}.target`, weight });
    }
  }
  return out;
}

const SKIN: Readonly<Record<keyof MakeHumanEthnicity, readonly [number, number, number]>> = {
  african: [0.36, 0.24, 0.18],
  asian: [0.86, 0.69, 0.55],
  caucasian: [0.9, 0.72, 0.62],
};

/** The preset's skin tone (sRGB), its ethnic mix blended. @internal */
export function makehumanSkinTone(ethnicity: MakeHumanEthnicity): THREE.Color {
  const total = ethnicity.african + ethnicity.asian + ethnicity.caucasian;
  const rgb = [0, 0, 0];
  for (const race of ["african", "asian", "caucasian"] as const) {
    const share = ethnicity[race] / total;
    SKIN[race].forEach((value, channel) => {
      rgb[channel] = (rgb[channel] ?? 0) + value * share;
    });
  }
  return new THREE.Color().setRGB(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, THREE.SRGBColorSpace);
}

/**
 * A MakeHuman bone name as the GLB names it: `.` becomes `_` (`upperarm01.L` → `upperarm01_L`), since
 * three.js reads a dot in a track name as a property path.
 * @internal
 */
export function makehumanBoneName(name: string): string {
  return name.replace(/\./g, "_");
}

/** Rocketbox Bip01 bones driving MakeHuman's default skeleton; twist, finger and face bones follow their parents. */
const BIP01_TO_MAKEHUMAN: readonly RetargetBone[] = [
  { target: "root", source: "Bip01_Pelvis" },
  { target: "spine05", source: "Bip01_Spine", aim: { target: "spine03", source: "Bip01_Spine1" } },
  { target: "spine03", source: "Bip01_Spine1", aim: { target: "spine01", source: "Bip01_Spine2" } },
  { target: "spine01", source: "Bip01_Spine2", aim: { target: "neck01", source: "Bip01_Neck" } },
  { target: "neck01", source: "Bip01_Neck", aim: { target: "head", source: "Bip01_Head" } },
  { target: "head", source: "Bip01_Head" },
  ...(["L", "R"] as const).flatMap((side): RetargetBone[] => [
    { target: `clavicle_${side}`, source: `Bip01_${side}_Clavicle`, aim: { target: `upperarm01_${side}`, source: `Bip01_${side}_UpperArm` } },
    { target: `upperarm01_${side}`, source: `Bip01_${side}_UpperArm`, aim: { target: `lowerarm01_${side}`, source: `Bip01_${side}_Forearm` } },
    { target: `lowerarm01_${side}`, source: `Bip01_${side}_Forearm`, aim: { target: `wrist_${side}`, source: `Bip01_${side}_Hand` } },
    { target: `wrist_${side}`, source: `Bip01_${side}_Hand` },
    { target: `upperleg01_${side}`, source: `Bip01_${side}_Thigh`, aim: { target: `lowerleg01_${side}`, source: `Bip01_${side}_Calf` } },
    { target: `lowerleg01_${side}`, source: `Bip01_${side}_Calf`, aim: { target: `foot_${side}`, source: `Bip01_${side}_Foot` } },
    { target: `foot_${side}`, source: `Bip01_${side}_Foot` },
  ]),
];

/** The Rocketbox clips each body plays, by gender, named so `classifyClip` finds idle, walk and run. */
const LOCOMOTION: Readonly<Record<MakeHumanPreset["gender"], readonly { name: string; clip: RocketboxClip }[]>> = {
  female: [
    { name: "Idle", clip: { name: "Idle", file: "f_idle_neutral_01.max.fbx", folder: "static" } },
    { name: "Walk", clip: { name: "Walk", file: "f_walk_neutral_01.max.fbx", folder: "xy" } },
    { name: "Run", clip: { name: "Run", file: "f_run_neutral_01.max.fbx", folder: "xy" } },
  ],
  male: [
    { name: "Idle", clip: { name: "Idle", file: "m_idle_neutral_01.max.fbx", folder: "static" } },
    { name: "Walk", clip: { name: "Walk", file: "m_walk_neutral_01.max.fbx", folder: "xy" } },
    { name: "Run", clip: { name: "Run", file: "m_run_neutral_01.max.fbx", folder: "xy" } },
  ],
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

/** MakeHuman's base mesh is in decimetres. */
const DECIMETRE = 0.1;

/**
 * Build one pinned MakeHuman person and write `<outDir>/model.glb`: the skinned body and eyes on
 * MakeHuman's default skeleton, a skin tone from the ethnic mix, and Rocketbox `Idle`, `Walk` and
 * `Run` retargeted onto it (walk and run in place).
 * @capability makehuman-character build a rigged, animated CC0 MakeHuman person from its base mesh and targets into one GLB
 */
export async function pullMakeHumanCharacter(preset: MakeHumanPreset, options: PullMakeHumanOptions): Promise<PulledMakeHuman> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const source = new MakeHumanSource(fetchImpl, options.githubToken);
  const base = parseObj(await source.text("3dobjs/base.obj"));
  const positions = Float32Array.from(base.positions);
  for (const target of makehumanTargets(preset)) applyTarget(positions, await source.text(target.path), target.weight);

  const skeletonFile = record(await source.json("rigs/default.mhskel"));
  const jointVerts = record(skeletonFile["joints"]);
  const boneSpecs = record(skeletonFile["bones"]);
  const weightsFile = record(await source.json("rigs/default_weights.mhw"));
  const weightLists = record(weightsFile["weights"]);

  let floor = Infinity;
  for (let i = 1; i < positions.length; i += 3) floor = Math.min(floor, positions[i] ?? Infinity);
  const at = (index: number) =>
    new THREE.Vector3((positions[index * 3] ?? 0) * DECIMETRE, ((positions[index * 3 + 1] ?? 0) - floor) * DECIMETRE, (positions[index * 3 + 2] ?? 0) * DECIMETRE);
  const joint = (name: string) => {
    const verts = numberList(jointVerts[name]);
    if (verts.length === 0) throw new Error(`MakeHuman skeleton: joint ${name} has no vertices`);
    const sum = new THREE.Vector3();
    for (const vert of verts) sum.add(at(vert));
    return sum.divideScalar(verts.length);
  };

  // Bones carry no rotation at rest; each sits at its head joint, so skinning needs no rolls.
  const bones = new Map<string, THREE.Bone>();
  const heads = new Map<string, THREE.Vector3>();
  for (const [name, specValue] of Object.entries(boneSpecs)) {
    const spec = record(specValue);
    const bone = new THREE.Bone();
    bone.name = makehumanBoneName(name);
    bones.set(name, bone);
    heads.set(name, joint(String(spec["head"])));
  }
  let rootBone: THREE.Bone | undefined;
  for (const [name, specValue] of Object.entries(boneSpecs)) {
    const bone = bones.get(name);
    const head = heads.get(name);
    if (bone === undefined || head === undefined) continue;
    const parentName = record(specValue)["parent"];
    const parent = typeof parentName === "string" ? bones.get(parentName) : undefined;
    const parentHead = typeof parentName === "string" ? heads.get(parentName) : undefined;
    if (parent === undefined || parentHead === undefined) {
      rootBone = bone;
      bone.position.copy(head);
    } else {
      parent.add(bone);
      bone.position.copy(head).sub(parentHead);
    }
  }
  if (rootBone === undefined) throw new Error("MakeHuman skeleton has no root bone");
  const boneList = [...bones.values()];
  const boneIndex = new Map([...bones.keys()].map((name, index) => [name, index]));

  // Up to four influences per base vertex, strongest first, normalised.
  const influences = new Map<number, [number, number][]>();
  for (const [boneName, listValue] of Object.entries(weightLists)) {
    const index = boneIndex.get(boneName);
    if (index === undefined || !Array.isArray(listValue)) continue;
    for (const pair of listValue) {
      const [vert, weight] = numberList(pair);
      if (vert === undefined || weight === undefined) continue;
      const list = influences.get(vert) ?? [];
      list.push([index, weight]);
      influences.set(vert, list);
    }
  }
  const headIndex = boneIndex.get("head") ?? 0;

  const eyes = parseObj(await source.text("eyes/low-poly/low-poly.obj"));
  const eyeMap = (await source.text("eyes/low-poly/low-poly.mhclo"))
    .split("verts 0")[1]
    ?.split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map(Number);
  if (eyeMap === undefined || eyeMap.length * 3 < eyes.positions.length) throw new Error("MakeHuman eye proxy: expected one base vertex per eye vertex");

  const buildGeometry = (faces: ObjMesh["faces"], uvs: readonly number[], baseIndexOf: (vert: number) => number) => {
    const key = new Map<string, number>();
    const out = { position: [] as number[], uv: [] as number[], skinIndex: [] as number[], skinWeight: [] as number[], index: [] as number[] };
    const corner = (vert: number, uv: number) => {
      const id = `${vert}/${uv}`;
      const existing = key.get(id);
      if (existing !== undefined) return existing;
      const next = out.position.length / 3;
      key.set(id, next);
      const baseVert = baseIndexOf(vert);
      const p = at(baseVert);
      out.position.push(p.x, p.y, p.z);
      out.uv.push(uvs[uv * 2] ?? 0, uvs[uv * 2 + 1] ?? 0);
      const list = [...(influences.get(baseVert) ?? [[headIndex, 1] as [number, number]])].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = list.reduce((sum, [, weight]) => sum + weight, 0) || 1;
      for (let slot = 0; slot < 4; slot += 1) {
        out.skinIndex.push(list[slot]?.[0] ?? 0);
        out.skinWeight.push((list[slot]?.[1] ?? 0) / total);
      }
      return next;
    };
    for (const face of faces) {
      const ids = face.verts.map((vert, i) => corner(vert, face.uvs[i] ?? -1));
      for (let i = 1; i + 1 < ids.length; i += 1) out.index.push(ids[0] ?? 0, ids[i] ?? 0, ids[i + 1] ?? 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.position, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(out.uv, 2));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(out.skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(out.skinWeight, 4));
    geometry.setIndex(out.index);
    geometry.computeVertexNormals();
    return geometry;
  };

  const bodyGeometry = buildGeometry(
    base.faces.filter((face) => face.group === "body"),
    base.uvs,
    (vert) => vert,
  );
  const eyeGeometry = buildGeometry(eyes.faces, eyes.uvs, (vert) => eyeMap[vert] ?? 0);
  const skeleton = new THREE.Skeleton(boneList);
  const armature = new THREE.Group();
  armature.name = preset.id;
  armature.add(rootBone);
  armature.updateMatrixWorld(true);
  const body = new THREE.SkinnedMesh(bodyGeometry, new THREE.MeshStandardMaterial({ name: "skin", color: makehumanSkinTone(preset.ethnicity), roughness: 0.62, metalness: 0 }));
  body.name = "body";
  const eyeMesh = new THREE.SkinnedMesh(eyeGeometry, new THREE.MeshStandardMaterial({ name: "eyes", color: new THREE.Color(0.32, 0.2, 0.12), roughness: 0.2, metalness: 0 }));
  eyeMesh.name = "eyes";
  for (const mesh of [body, eyeMesh]) {
    armature.add(mesh);
    mesh.bind(skeleton);
  }

  const clips: THREE.AnimationClip[] = [];
  for (const { name, clip } of LOCOMOTION[preset.gender]) {
    const loaded = await loadRocketboxClip(clip, { fetchImpl, githubToken: options.githubToken });
    const retarget: RetargetOptions = {
      name,
      bones: BIP01_TO_MAKEHUMAN,
      hip: { target: "root", source: "Bip01_Pelvis" },
      sides: { target: ["upperleg01_L", "upperleg01_R"], source: ["Bip01_L_Thigh", "Bip01_R_Thigh"] },
      inPlace: clip.folder !== "static",
    };
    clips.push(retargetClipByRest(armature, loaded.skeleton, loaded.clip, retarget));
  }

  const scene = new THREE.Scene();
  scene.add(armature);
  installFileReader();
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips, onlyVisible: false });
  if (!(glb instanceof ArrayBuffer)) throw new Error(`${preset.id}: the exporter returned no binary GLB`);
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const document = await io.readBinary(new Uint8Array(glb));
  await document.transform(dedup(), resample(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  mkdirSync(options.outDir, { recursive: true });
  const file = join(options.outDir, "model.glb");
  const bytes = await io.writeBinary(document);
  writeFileSync(file, bytes);
  let top = -Infinity;
  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i] ?? -Infinity);
  const height = (top - floor) * DECIMETRE;
  return {
    id: preset.id,
    file,
    bytes: bytes.byteLength,
    triangles: ((bodyGeometry.index?.count ?? 0) + (eyeGeometry.index?.count ?? 0)) / 3,
    bones: boneList.length,
    clips: clips.map((clip) => clip.name),
    height,
  };
}
