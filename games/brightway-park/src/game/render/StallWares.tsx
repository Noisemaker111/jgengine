/** @jsxImportSource @jgengine/core/ui/jsx */
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";

import { assets } from "../assets";
import { groundAt } from "../build/terrain";
import { park, type ParkObject } from "../park";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { loadDraw } from "@jgengine/core/frame/loadDraw.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useGameContext } from "@jgengine/ui/provider";
import { useRef } from "@jgengine/core/ui/jsx";

const FOOD = "quaternius-low-poly-food-pack";
const FANTASY = "quaternius-fantasy-props";

/** Counter wares per stall kind: library model, longest side in metres, and where on the 3 m counter it sits. */
const WARES: Readonly<Record<string, readonly { model: string; size: number; x: number }[]>> = {
  stall_food: [{ model: `${FOOD}/Popsicle_Strawberry`, size: 0.5, x: -0.9 }, { model: `${FOOD}/Cupcake`, size: 0.45, x: 0 }, { model: `${FOOD}/Popsicle_Multiple`, size: 0.55, x: 0.9 }],
  stall_pizza: [{ model: `${FOOD}/Apple`, size: 0.4, x: -0.8 }, { model: `${FOOD}/Apple`, size: 0.4, x: 0 }, { model: `${FOOD}/Apple_Green`, size: 0.4, x: 0.8 }],
  stall_icecream: [{ model: `${FOOD}/IceCream_3`, size: 0.55, x: -0.8 }, { model: `${FOOD}/IceCream_Cone2`, size: 0.55, x: 0 }, { model: `${FOOD}/IceCream_4`, size: 0.55, x: 0.8 }],
  stall_drink: [{ model: `${FANTASY}/Potion_1`, size: 0.5, x: -0.8 }, { model: `${FANTASY}/Potion_2`, size: 0.55, x: 0 }, { model: `${FANTASY}/Potion_4`, size: 0.5, x: 0.8 }],
  stall_coffee: [{ model: `${FANTASY}/Mug`, size: 0.4, x: -0.6 }, { model: `${FOOD}/Donut2`, size: 0.45, x: 0.6 }],
  stall_souvenir: [{ model: `${FANTASY}/Book_Stack_1`, size: 0.5, x: -0.7 }, { model: `${FANTASY}/Chalice`, size: 0.45, x: 0.7 }],
};

const gltfLoader = new GLTFLoader();

/** Library wares on the counter of a stall, in the stall's own frame. */
export function stallWaresDraw(ctx: GameContext, object: ParkObject): EngineDraw | null {
  const wares = WARES[object.kind];
  if (wares === undefined) return null;
  const yaw = (park.of(ctx).num(`${object.id}.rot`) * Math.PI) / 2;
  const group = new THREE.Group();
  group.position.set(object.x, groundAt(park.of(ctx), object.x, object.z), object.z);
  group.rotation.set(0, yaw, 0);
  group.raycast = () => {};
  const draws: { draw: EngineDraw; holder: THREE.Group; state: EngineFrameState | null }[] = [];
  for (const ware of wares) {
    const ref = assets.resolve(ware.model);
    if (ref === null || ref.dims === undefined) continue;
    const { dims } = ref;
    const height = (dims.maxY ?? 1) - (dims.minY ?? 0);
    const width = Math.max(dims.footprint.w, dims.footprint.d);
    const minY = dims.minY ?? 0;
    const scale = ware.size / Math.max(width, height);
    const holder = new THREE.Group();
    holder.position.set(ware.x, 1.27 - minY * scale, 1.45);
    holder.scale.setScalar(scale);
    group.add(holder);
    draws.push({
      draw: loadDraw({
        key: `gltf:${ref.url}`,
        load: () => gltfLoader.loadAsync(ref.url),
        build: (gltf, parent) => {
          const copy = gltf.scene.clone(true);
          copy.traverse((node) => { node.castShadow = true; node.receiveShadow = true; });
          parent.add(copy);
        },
      }),
      holder,
      state: null,
    });
  }
  return {
    mount(state) {
      state.scene.add(group);
      for (const entry of draws) {
        entry.state = childFrameState(state, entry.holder);
        entry.draw.mount?.(entry.state);
      }
    },
    frame(state) {
      for (const entry of draws) entry.draw.frame?.(entry.state ?? state, (entry.state ?? state).delta);
    },
    dispose(state) {
      for (const entry of draws) entry.draw.dispose?.(entry.state ?? state);
      state.scene.remove(group);
    },
  };
}

export function StallWares({ object }: { object: ParkObject }) {
  const ctx = useGameContext();
  const latest = useRef({ ctx, object });
  latest.current = { ctx, object };
  useEngineDraw(() => {
    const draw = stallWaresDraw(latest.current.ctx, latest.current.object);
    return draw ?? { mount() {}, frame() {}, dispose() {} };
  }, [ctx, object]);
  return null;
}
