import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMaterialTemplate } from "@jgengine/core/material/materialAsset";

import { initialMaterialAssignment, MaterialsWorkspacePanel } from "./MaterialsWorkspacePanel";
import { createEditorHost } from "./session";

test("selected model initializes the controls and selector from its assignment instead of library order", () => {
  const host = createEditorHost({ gameId: "material-workspace-selection", layers: {
    materialAssets: [createMaterialTemplate("wool", "wool", "Custom wool"), createMaterialTemplate("silk", "silk", "Custom silk")],
    markers: [{ id: "chair", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { materialAssignments: [{ materialId: "silk", selector: { mesh: "Cushion", slot: "Upholstery", slotIndex: 1 } }] } }],
  } });
  try {
    expect(host.api.handle({ method: "select", ids: ["chair"] }).ok).toBe(true);
    const html = renderToStaticMarkup(createElement(MaterialsWorkspacePanel, { session: host.session, api: host.api }));
    expect(html).toContain('<option value="silk" selected="">Custom silk</option>');
    expect(html).toContain('aria-label="Assignment mesh name" placeholder="Mesh name (optional)" class=');
    expect(html).toContain('value="Cushion"');
    expect(html).toContain('value="Upholstery"');
    expect(html).toContain('aria-label="Thread cycles per UV"');
  } finally { host.dispose(); }
});

test("assignment initialization skips invalid references and preserves the primary selected model", () => {
  const silk = createMaterialTemplate("silk", "silk");
  const document = { materialAssets: [silk], markers: [
    { id: "chair", kind: "prop", position: { x: 0, y: 0, z: 0 }, meta: { materialAssignments: [
      { materialId: "missing", selector: { slot: "Frame" } },
      { materialId: "silk", selector: {} },
      { materialId: "silk", selector: { slot: "Upholstery" } },
    ] } },
    { id: "unassigned", kind: "prop", position: { x: 1, y: 0, z: 0 } },
  ] };
  expect(initialMaterialAssignment(document, ["chair"])).toEqual({ materialId: "silk", selector: { slot: "Upholstery" } });
  expect(initialMaterialAssignment(document, ["unassigned"])).toBeNull();
  expect(initialMaterialAssignment({ ...document, markers: [...document.markers].reverse() }, ["chair", "unassigned"])).toBeNull();
});

test("a selected native model preview mounts before any material asset is created", () => {
  const host = createEditorHost({ gameId: "material-slots-before-authoring", layers: {
    markers: [{ id: "chair", kind: "prop", catalogId: "chair-model", position: { x: 0, y: 0, z: 0 } }],
  }, assets: [{ id: "chair-model", label: "Chair", kind: "model", url: "/chair.glb" }] });
  try {
    host.api.handle({ method: "select", ids: ["chair"] });
    let mounted = false;
    const html = renderToStaticMarkup(createElement(MaterialsWorkspacePanel, { session: host.session, api: host.api, preview: (asset, mode) => {
      mounted = true;
      expect(asset).toBeUndefined();
      expect(mode).toBe("neutral");
      return createElement("div", null, "Selected imported model preview");
    } }));
    expect(mounted).toBe(true);
    expect(html).toContain("Selected imported model preview");
    expect(host.session.getState().document.materialAssets).toBeUndefined();
  } finally { host.dispose(); }
});
