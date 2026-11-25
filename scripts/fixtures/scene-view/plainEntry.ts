import house from "../../../apps/web/src/live/smallScene/house.scene.json";
import { exposeBench } from "./benchPage";
import { drawPlainHouse } from "../../../apps/web/src/live/smallScene/plainThree";

const canvas = document.querySelector("canvas")!;
const { renderer } = drawPlainHouse(canvas, house as Parameters<typeof drawPlainHouse>[1]);
exposeBench(renderer, Promise.resolve());
