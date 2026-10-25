import { useLayoutEffect, useRef } from "react";

import { recordProfileSection } from "@/runtime/runtimePerformanceProfiler";

export function useProfiledRender(sectionId: string): void {
  const startedAtRef = useRef(performance.now());
  startedAtRef.current = performance.now();

  useLayoutEffect(() => {
    recordProfileSection(sectionId, performance.now() - startedAtRef.current);
  });
}