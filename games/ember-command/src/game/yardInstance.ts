import { editorLayers } from "../editorLayers";
import { readYardLayout, type YardLayout } from "./yard";
import { buildYardNav, type YardNav } from "./yardNav";

/** The authored yard this game is played on, read once from the scene document. */
export let YARD: YardLayout = readYardLayout(editorLayers);

/** The yard's walkable grid: the hose is a wall but for its crossings, patio stones are climbs. */
export let YARD_NAV: YardNav = buildYardNav(YARD);

/** Re-read the yard from the live lawn's document (the scene set switched lawns). */
export function rebindYard(): void {
  YARD = readYardLayout(editorLayers);
  YARD_NAV = buildYardNav(YARD);
}
