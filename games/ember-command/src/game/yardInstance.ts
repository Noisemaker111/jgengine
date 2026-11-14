import { editorLayers } from "../editorLayers";
import { readYardLayout, type YardLayout } from "./yard";
import { buildYardNav, type YardNav } from "./yardNav";

/** The authored yard this game is played on, read once from the scene document. */
export const YARD: YardLayout = readYardLayout(editorLayers);

/** The yard's walkable grid: the hose is a wall but for its crossings, patio stones are climbs. */
export const YARD_NAV: YardNav = buildYardNav(YARD);
