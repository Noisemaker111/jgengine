import { bindingLabel, type ActionCodes, type ActionCodesMap } from "@jgengine/core/input/actionBindings";

interface KeybindRow {
  action: string;
  codes: string;
  mode: "press" | "hold" | "toggle";
}

function flattenCodes(codes: ActionCodes): { codes: string; mode: "press" | "hold" | "toggle" }[] {
  if (Array.isArray(codes)) {
    return [{ codes: codes.map(bindingLabel).join(" / "), mode: "press" }];
  }
  const modes = codes as { hold?: readonly string[]; toggle?: readonly string[] };
  const result: { codes: string; mode: "press" | "hold" | "toggle" }[] = [];
  if (modes.hold !== undefined && modes.hold.length > 0) {
    result.push({ codes: modes.hold.map(bindingLabel).join(" / "), mode: "hold" });
  }
  if (modes.toggle !== undefined && modes.toggle.length > 0) {
    result.push({ codes: modes.toggle.map(bindingLabel).join(" / "), mode: "toggle" });
  }
  return result;
}

function keybindRows(input: ActionCodesMap | undefined): KeybindRow[] {
  const rows: KeybindRow[] = [];
  for (const [action, codes] of Object.entries(input ?? {})) {
    const entries = flattenCodes(codes);
    for (const entry of entries) rows.push({ action, ...entry });
  }
  return rows;
}

export function KeysPanel({ input }: { input: ActionCodesMap | undefined }) {
  const rows = keybindRows(input);
  if (rows.length === 0) return <div className="text-neutral-400">This game declares no keybinds.</div>;
  return (
    <div className="jg-devtools-scroll max-h-64 space-y-0.5 overflow-auto">
      {rows.map((row, index) => (
        <div key={index} className="flex items-baseline justify-between gap-3">
          <span className="text-neutral-300">{row.action}</span>
          <span className="font-mono text-neutral-100">
            {row.codes}
            {row.mode !== "press" ? <span className="ml-1 text-[9px] uppercase text-neutral-500">{row.mode}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
