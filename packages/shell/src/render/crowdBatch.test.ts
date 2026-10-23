import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { CrowdMember } from "./crowdRegistry";
import { CharacterCrowdRegistry } from "./crowdRegistry";
import { poseTimeOffset, writeCrowdBatch, type CrowdPlayback } from "./crowdBatch";

const placement = { scale: 1, offset: new THREE.Vector3(0, 0, 0) };
const clips = ["Idle", "Walk", "Run"];
const clipIndex = new Map(clips.map((clip, index) => [clip, index]));

/** One batch of `capacity` slot, exactly as `CrowdBatch` builds it. */
function batch(capacity: number) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), capacity);
  mesh.count = 0;
  const play = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  geometry.setAttribute("crowdPlay", play);
  const playback = new Map<string, CrowdPlayback>();
  const ids: string[] = [];
  return {
    mesh,
    play,
    playback,
    ids,
    write(members: readonly { id: string; member: CrowdMember }[], time = 0) {
      return writeCrowdBatch({
        mesh,
        play,
        members,
        placement,
        clips,
        bands: { walk: 0.25, run: 2.6 },
        clipIndex,
        time,
        playback,
        ids,
      });
    },
  };
}

function member(x: number, speed = 0): CrowdMember {
  return { x, y: 0, z: 0, rotationY: 0, speed };
}

/** The world x each drawn instance stands at. */
function drawnX(mesh: THREE.InstancedMesh, count: number): number[] {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const xs: number[] = [];
  for (let index = 0; index < count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    xs.push(Number(position.x.toFixed(3)));
  }
  return xs;
}

describe("a character batch", () => {
  test("draws any number of identical characters from one instance buffer", () => {
    const one = batch(8);
    expect(one.write([{ id: "a", member: member(1) }])).toBe(1);
    expect(one.mesh.count).toBe(1);

    const crowd = batch(8);
    const members = Array.from({ length: 8 }, (_, index) => ({ id: `guest_${index}`, member: member(index) }));
    expect(crowd.write(members)).toBe(8);
    expect(crowd.mesh.count).toBe(8);
    expect(drawnX(crowd.mesh, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(crowd.ids).toEqual(members.map((entry) => entry.id));
  });

  test("gives every member its own clip and time offset, so a crowd is not in lockstep", () => {
    const crowd = batch(4);
    crowd.write([
      { id: "walking", member: member(0, 1.5) },
      { id: "running", member: member(1, 4) },
      { id: "idle", member: member(2, 0) },
    ]);
    expect([0, 1, 2].map((slot) => crowd.play.getX(slot))).toEqual([1, 2, 0]);
    const offsets = [0, 1, 2].map((slot) => crowd.play.getY(slot));
    expect(new Set(offsets.map((offset) => offset.toFixed(4))).size).toBe(3);
    expect(offsets[0]).toBeCloseTo(poseTimeOffset("walking"), 5);
  });

  test("a character leaving compacts the rest instead of leaving its matrix or id behind", () => {
    const crowd = batch(4);
    expect(crowd.write([
      { id: "a", member: member(10) },
      { id: "b", member: member(20) },
      { id: "c", member: member(30) },
    ])).toBe(3);
    expect(drawnX(crowd.mesh, crowd.mesh.count)).toEqual([10, 20, 30]);

    expect(crowd.write([
      { id: "a", member: member(10) },
      { id: "c", member: member(30) },
    ])).toBe(2);
    expect(crowd.mesh.count).toBe(2);
    expect(drawnX(crowd.mesh, crowd.mesh.count)).toEqual([10, 30]);
    expect(crowd.ids).toEqual(["a", "c"]);

    // The survivor takes the freed slot without inheriting the departed member's transform.
    expect(crowd.write([
      { id: "a", member: member(10) },
      { id: "c", member: member(30) },
      { id: "d", member: member(40) },
    ])).toBe(3);
    expect(drawnX(crowd.mesh, crowd.mesh.count)).toEqual([10, 30, 40]);
    expect(crowd.ids).toEqual(["a", "c", "d"]);
  });

  test("an empty batch draws nothing and keeps no ids for picking", () => {
    const crowd = batch(4);
    crowd.write([{ id: "a", member: member(10) }]);
    expect(crowd.write([])).toBe(0);
    expect(crowd.mesh.count).toBe(0);
    expect(crowd.ids).toEqual([]);
  });

  test("never draws past its capacity even when the registry hands it more", () => {
    const crowd = batch(2);
    expect(crowd.write([{ id: "a", member: member(1) }, { id: "b", member: member(2) }, { id: "c", member: member(3) }])).toBe(2);
    expect(crowd.ids).toEqual(["a", "b"]);
  });

  test("keeps the cull sphere around the members it drew", () => {
    const crowd = batch(8);
    crowd.write([{ id: "a", member: member(-4) }, { id: "b", member: member(6) }]);
    expect(crowd.mesh.boundingSphere?.center.x).toBeCloseTo(1);
    expect(crowd.mesh.boundingSphere!.radius).toBeGreaterThan(5);
  });
});

describe("one draw per model and material", () => {
  test("identical characters of one model are one batch; a different model is another", () => {
    const registry = new CharacterCrowdRegistry();
    registry.setCapacity("guest-a", 8);
    registry.setCapacity("guest-b", 8);
    expect(registry.claim("a", "guest-a", member(0))).toBe(true);
    expect(registry.claim("b", "guest-a", member(1))).toBe(true);
    expect(registry.claim("c", "guest-b", member(2))).toBe(true);
    const seen: string[] = [];
    registry.forEach("guest-a", (id) => seen.push(id));
    expect(seen).toEqual(["a", "b"]);
    expect(registry.count("guest-b")).toBe(1);
  });
});
