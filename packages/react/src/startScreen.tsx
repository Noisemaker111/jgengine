import { Fragment, type CSSProperties, type ReactNode } from "react";
import { actionLabel, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import { useDisplayProfile } from "./display";
import { Keycap } from "./keyHint";
import { SettingsTrigger } from "./settings";

/**
 * One row of a control legend. Name the game action(s) whose bound key(s) to
 * show (`action`) so the glyphs come straight from the keybind map — never
 * re-typed — or give literal `keys` for controls that live outside the map
 * (`"Mouse"`, `"LMB"`). `label` says what the control does.
 */
export interface ControlHint {
  action?: string | readonly string[];
  keys?: string | readonly string[];
  label: string;
  separator?: string;
}

function toArray(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

function resolveKeys(hint: ControlHint, bindings: ActionCodesMap | undefined): string[] {
  const literal = toArray(hint.keys);
  if (literal.length > 0) return [...literal];
  if (bindings === undefined) return [];
  const glyphs: string[] = [];
  for (const action of toArray(hint.action)) {
    const glyph = actionLabel(bindings, action);
    if (glyph !== null) glyphs.push(glyph);
  }
  return glyphs;
}

/**
 * Renders a controls legend whose key glyphs come from the game's keybind map,
 * so bindings live in one place and never drift from a hand-typed table. Hides
 * itself on coarse-pointer devices (a touchscreen has no keyboard) via the same
 * `data-jg-kbd-hint` marker as `KeyHint`. Headless: every part carries a
 * `className` slot and `data-*` hook; pass `renderKey`/`renderRow` to fully own
 * the markup.
 *
 * @capability controls-list keybind-derived control legend that hides on touch
 */
export function ControlsList({
  bindings,
  controls,
  hideOnCoarsePointer = true,
  separator = " / ",
  className,
  rowClassName,
  keysClassName,
  keyClassName,
  separatorClassName,
  labelClassName,
  renderKey,
  renderRow,
}: {
  bindings?: ActionCodesMap;
  controls: readonly ControlHint[];
  hideOnCoarsePointer?: boolean;
  separator?: string;
  className?: string;
  rowClassName?: string;
  keysClassName?: string;
  keyClassName?: string;
  separatorClassName?: string;
  labelClassName?: string;
  renderKey?: (key: string, index: number) => ReactNode;
  renderRow?: (row: { keys: readonly string[]; label: string }, index: number) => ReactNode;
}): ReactNode {
  const { coarsePointer } = useDisplayProfile();
  if (hideOnCoarsePointer && coarsePointer) return null;
  const rows = controls.map((hint) => ({ keys: resolveKeys(hint, bindings), label: hint.label, separator: hint.separator }));
  return (
    <div data-jg-controls="" data-jg-kbd-hint={hideOnCoarsePointer ? "" : undefined} className={className}>
      {rows.map((row, index) =>
        renderRow !== undefined ? (
          <Fragment key={index}>{renderRow(row, index)}</Fragment>
        ) : (
          <div key={index} data-jg-control="" className={rowClassName}>
            <span data-jg-control-keys="" className={keysClassName}>
              {row.keys.map((key, keyIndex) => (
                <Fragment key={keyIndex}>
                  {keyIndex > 0 ? (
                    <span data-jg-control-sep="" className={separatorClassName}>
                      {row.separator ?? separator}
                    </span>
                  ) : null}
                  {renderKey !== undefined ? renderKey(key, keyIndex) : <Keycap className={keyClassName}>{key}</Keycap>}
                </Fragment>
              ))}
            </span>
            <span data-jg-control-label="" className={labelClassName}>
              {row.label}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** Which corner of a `StartScreen` the opt-in settings slot is pinned to. */
export type StartScreenCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNER_STYLE: Record<StartScreenCorner, CSSProperties> = {
  "top-left": { position: "absolute", top: 0, left: 0 },
  "top-right": { position: "absolute", top: 0, right: 0 },
  "bottom-left": { position: "absolute", bottom: 0, left: 0 },
  "bottom-right": { position: "absolute", bottom: 0, right: 0 },
};

/**
 * Composable title/attract-screen scaffold: a full-bleed `data-jg-menu` overlay
 * that positions and centers the game's own content, with an opt-in settings
 * corner. It imposes no look — the game supplies the title, art, and buttons as
 * children and styles the container through `className`/`style` (per the
 * composable-chrome rule: a placement hook, not a mandated menu).
 *
 * @capability start-screen headless title/attract overlay the game fills and skins
 */
export function StartScreen({
  open = true,
  className,
  style,
  children,
  settings,
  settingsPlacement = "top-right",
  settingsClassName,
  settingsWrapperClassName,
}: {
  open?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  settings?: boolean | ReactNode;
  settingsPlacement?: StartScreenCorner;
  settingsClassName?: string;
  settingsWrapperClassName?: string;
}): ReactNode {
  if (!open) return null;
  return (
    <div data-jg-menu="" data-screen="start" className={className} style={style}>
      {settings !== undefined && settings !== false ? (
        <div
          data-jg-menu-settings=""
          className={settingsWrapperClassName}
          style={settingsWrapperClassName === undefined ? CORNER_STYLE[settingsPlacement] : undefined}
        >
          {settings === true ? <SettingsTrigger className={settingsClassName} /> : settings}
        </div>
      ) : null}
      {children}
    </div>
  );
}
