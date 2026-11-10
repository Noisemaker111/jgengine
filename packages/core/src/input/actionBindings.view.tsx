/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, type ReactNode } from "../ui/jsx";
import type { ActionCodesMap } from "./actionBindings";

const EMPTY_BINDINGS: ActionCodesMap = {};
const Bindings = createContext<ActionCodesMap>(EMPTY_BINDINGS);

/** Provide the game's live bindings, including player rebinds, without a presentation kit. */
export function ActionBindingsProvider({ bindings,children }: { bindings: ActionCodesMap; children?: ReactNode }): ReactNode {
  return <Bindings value={bindings}>{children}</Bindings>;
}

/** Live action bindings from the nearest provider; empty outside a game host. */
export function useActionBindings(): ActionCodesMap { return useContext(Bindings); }
