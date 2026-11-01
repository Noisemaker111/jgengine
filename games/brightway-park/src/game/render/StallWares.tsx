// framework-ok: puts catalog props on a game-authored stall's counter; other games' stalls want it once the engine owns stall dressing.
import { Suspense, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { assets } from "../assets";
import { groundAt } from "../build/terrain";
import { park, type ParkObject } from "../park";
import { useGameContext } from "@jgengine/react/provider";

const FOOD = "quaternius-low-poly-food-pack";

/** Counter wares per stall kind: pack model, longest side in metres, and where on the 3 m counter it sits. */
const WARES: Readonly<Record<string, readonly { model: string; size: number; x: number }[]>> = {
  stall_food: [{ model: "Burger", size: 0.55, x: -0.9 }, { model: "Fries", size: 0.5, x: 0 }, { model: "Hotdog", size: 0.6, x: 0.9 }],
  stall_pizza: [{ model: "Pizza", size: 0.75, x: -0.7 }, { model: "Pizza_Slice", size: 0.5, x: 0.7 }],
  stall_icecream: [{ model: "IceCream_Cone", size: 0.55, x: -0.8 }, { model: "IceCream_Cone2", size: 0.55, x: 0 }, { model: "IceCream_Cone", size: 0.55, x: 0.8 }],
  stall_drink: [{ model: "Soda", size: 0.55, x: -0.8 }, { model: "Soda", size: 0.55, x: 0 }, { model: "Soda", size: 0.55, x: 0.8 }],
  stall_coffee: [{ model: "Cupcake", size: 0.4, x: -0.6 }, { model: "Croissant", size: 0.5, x: 0.6 }],
};

function Ware({ url, height, width, minY, size, x }: { url: string; height: number; width: number; minY: number; size: number; x: number }) {
  const gltf = useLoader(GLTFLoader, url);
  const copy = useMemo(() => gltf.scene.clone(true), [gltf]);
  const scale = size / Math.max(width, height);
  return <primitive object={copy} position={[x, 1.27 - minY * scale, 1.45]} scale={scale} />;
}

/** Food-pack props on the counter of a stall, in the stall's own frame. */
export function StallWares({ object }: { object: ParkObject }) {
  const ctx = useGameContext();
  const wares = WARES[object.kind];
  if (wares === undefined) return null;
  const yaw = (park.of(ctx).num(`${object.id}.rot`) * Math.PI) / 2;
  return (
    <group position={[object.x, groundAt(park.of(ctx), object.x, object.z), object.z]} rotation={[0, yaw, 0]} raycast={() => {}}>
      {wares.map((ware, index) => {
        const ref = assets.resolve(`${FOOD}/${ware.model}`);
        if (ref === null || ref.dims === undefined) return null;
        const { dims } = ref;
        return <Suspense key={index} fallback={null}><Ware url={ref.url} height={(dims.maxY ?? 1) - (dims.minY ?? 0)} width={Math.max(dims.footprint.w, dims.footprint.d)} minY={dims.minY ?? 0} size={ware.size} x={ware.x} /></Suspense>;
      })}
    </group>
  );
}
