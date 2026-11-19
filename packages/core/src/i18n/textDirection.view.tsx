/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, type ReactNode } from "@jgengine/core/ui/jsx";

import type { TextDirection } from "./textDirection";

const DirectionContext = createContext<TextDirection>("ltr");

export function TextDirectionProvider({ direction, children }: { direction: TextDirection; children: ReactNode }): ReactNode {
  return <DirectionContext.Provider value={direction}>{children}</DirectionContext.Provider>;
}

export function useTextDirection(): TextDirection {
  return useContext(DirectionContext);
}
