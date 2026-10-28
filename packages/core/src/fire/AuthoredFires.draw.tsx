// @skill jgengine-world
import { useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";

import type { EditorDocument } from "../editor/types";
import type { FireLandscape } from "./fireLandscape";
import { FireLandscapeView } from "./FireLandscape.draw";

/** Props for {@link AuthoredFires}. */
export interface AuthoredFiresProps {
  document: EditorDocument;
  /** Ground height so flames and scorch sit on terrain; flat y = 0 when omitted. */
  heightAt?: (x: number, z: number) => number;
}

const keys = new WeakMap<FireLandscape, number>();
let nextKey = 0;
function keyOf(fire: FireLandscape): number {
  let key = keys.get(fire);
  if (key === undefined) {
    key = nextKey++;
    keys.set(fire, key);
  }
  return key;
}

/**
 * Draw the document's authored fire areas from the game's own authored simulation (`ctx.environment`),
 * so what burns on screen is what gameplay reads. Smoke drifts with the weather's wind at each area.
 *
 * @capability authored-fire-rendering draw editor-authored fire areas burning in the shared authored simulation
 */
export function AuthoredFires({ document, heightAt }: AuthoredFiresProps) {
  const ctx = useGameContext();
  const [fires, setFires] = useState<readonly FireLandscape[]>([]);
  const areas = document.simulation?.fires;
  useFrame(() => {
    const next: FireLandscape[] = [];
    for (const area of areas ?? []) {
      const fire = ctx.environment.fire(area.id);
      if (fire !== undefined) next.push(fire);
    }
    if (next.length !== fires.length || next.some((fire, index) => fire !== fires[index])) setFires(next);
  });
  return (
    <>
      {fires.map((fire) => {
        const wind = ctx.environment.sample(fire.originX + (fire.cols * fire.cellSize) / 2, fire.originZ + (fire.rows * fire.cellSize) / 2).wind;
        return <FireLandscapeView key={keyOf(fire)} fire={fire} wind={wind} {...(heightAt === undefined ? {} : { heightAt })} />;
      })}
    </>
  );
}
