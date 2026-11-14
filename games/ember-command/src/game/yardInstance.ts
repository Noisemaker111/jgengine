import { editorLayers } from "../editorLayers";
import { readYardLayout, type YardLayout } from "./yard";

/** The authored yard this game is played on, read once from the scene document. */
export const YARD: YardLayout = readYardLayout(editorLayers);
