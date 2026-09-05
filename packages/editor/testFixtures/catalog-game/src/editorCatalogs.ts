export function editorCatalogs() {
  return [{
    id: "towers",
    label: "Towers",
    schema: { fields: [{ key: "damage", type: "number", default: 1 }] },
    entries: [{ id: "arrow", label: "Arrow tower", meta: { damage: 8 } }],
  }];
}
