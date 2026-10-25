import { useEffect } from "react";

import { BuilderStore, type BuilderTool, useBuilderState } from "@/dev/builder/builderStore";

const TOOL_SHORTCUTS: Record<string, BuilderTool> = {
  v: "select",
  w: "wall",
  p: "primitive",
  m: "material",
  x: "delete",
};


export function useBuilderShortcuts() {
  const state = useBuilderState();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = target
        && (target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
          || target.isContentEditable);
      if (inField) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        BuilderStore.undo();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        if (state.activePlacement) {
          event.preventDefault();
          BuilderStore.clearActivePlacement();
          return;
        }
        if (state.wallStart) {
          BuilderStore.setTool(state.tool);
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedRefs.length > 0) {
          event.preventDefault();
          BuilderStore.deleteSelected();
        }
        return;
      }
      if (event.key === "d" && (event.shiftKey)) {
        event.preventDefault();
        BuilderStore.duplicateSelection();
        return;
      }
      const tool = TOOL_SHORTCUTS[key];
      if (tool) {
        event.preventDefault();
        BuilderStore.setTool(tool);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.wallStart, state.tool, state.selectedRefs.length, state.activePlacement, state.editingScope]);
}
