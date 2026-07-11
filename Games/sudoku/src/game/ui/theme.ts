import type { CSSProperties } from "react";

// Ivory paper, ink digits, indigo accents, slate pencil notes.
export const PAPER = "#f6f1e3";
export const THIN_LINE = "#d3c7a4";
export const BOX_LINE = "#2b2620";
export const INK = "#26221b";
export const INDIGO = "#4338ca";
export const INDIGO_SOFT = "#eef0fb";
export const NOTE = "#64748b";
export const SEL = "#d7ddfb";
export const SAME = "#b9c2f6";
export const PEER = "#ece5d2";
export const CONFLICT = "#c81e1e";

export const pageBackdrop: CSSProperties = {
  background: "radial-gradient(125% 125% at 50% 0%, #fbf8ef 0%, #efe7d2 55%, #e2d9c0 100%)",
};

export const cardStyle: CSSProperties = {
  background: "#fbf8f0",
  border: `1px solid ${THIN_LINE}`,
  boxShadow: "0 12px 30px -14px rgba(40,34,22,0.5)",
  color: INK,
};

export const boardFrame: CSSProperties = {
  background: PAPER,
  border: `2.5px solid ${BOX_LINE}`,
  boxShadow: "0 14px 34px -16px rgba(30,26,18,0.6)",
};
