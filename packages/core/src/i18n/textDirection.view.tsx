import { createContext, useContext, type ReactNode } from "react";

import type { TextDirection } from "./textDirection";

const DirectionContext = createContext<TextDirection>("ltr");

/** Sets the reading direction `useTextDirection` answers below it. */
export function TextDirectionProvider({ direction, children }: { direction: TextDirection; children: ReactNode }): ReactNode {
  return <DirectionContext.Provider value={direction}>{children}</DirectionContext.Provider>;
}

/** The reading direction of the active locale; `ltr` when no locale root is above. */
export function useTextDirection(): TextDirection {
  return useContext(DirectionContext);
}
