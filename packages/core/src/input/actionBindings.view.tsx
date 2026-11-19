/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, type ReactNode } from "../ui/jsx";
import type { ActionCodesMap } from "./actionBindings";

const EMPTY_BINDINGS: ActionCodesMap = {};
const Bindings = createContext<ActionCodesMap>(EMPTY_BINDINGS);

export function ActionBindingsProvider({ bindings,children }: { bindings: ActionCodesMap; children?: ReactNode }): ReactNode {
  return <Bindings value={bindings}>{children}</Bindings>;
}

export function useActionBindings(): ActionCodesMap { return useContext(Bindings); }
