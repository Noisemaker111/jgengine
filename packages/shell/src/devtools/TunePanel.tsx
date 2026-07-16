import { useState } from "react";

import {
  convertAngle,
  devtools,
  parseColor,
  type DevtoolsControl,
  type DiscoveredEntry,
} from "@jgengine/core/devtools/devtools";
import { getSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";

import { persistDevtoolsOverrides } from "./devtoolsOverrides";

function ControlInput({ control, onWrite }: { control: DevtoolsControl; onWrite: () => void }) {
  const value = control.read();
  const write = (next: unknown) => {
    if (control.write(next)) onWrite();
  };
  if (control.kind === "slider" || control.kind === "angle") {
    const unit = control.unit ?? "rad";
    const displayUnit = control.displayUnit ?? (control.kind === "angle" ? "deg" : unit);
    const displayValue =
      control.kind === "angle" && typeof value === "number"
        ? convertAngle(value, unit, displayUnit)
        : Number(value);
    const displayMin =
      control.min !== undefined && control.kind === "angle"
        ? convertAngle(control.min, unit, displayUnit)
        : control.min;
    const displayMax =
      control.max !== undefined && control.kind === "angle"
        ? convertAngle(control.max, unit, displayUnit)
        : control.max;
    const displayStep =
      control.step !== undefined && control.kind === "angle" && unit !== displayUnit
        ? convertAngle(control.step, unit, displayUnit)
        : control.step;
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="h-1 w-28 accent-cyan-400"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          onChange={(event) => {
            const next = Number(event.target.value);
            write(control.kind === "angle" ? convertAngle(next, displayUnit, unit) : next);
          }}
        />
        <input
          type="number"
          className="w-16 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-neutral-100"
          step={displayStep}
          value={Number(displayValue.toFixed(4))}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) {
              write(control.kind === "angle" ? convertAngle(next, displayUnit, unit) : next);
            }
          }}
        />
        {control.kind === "angle" ? (
          <span className="text-[10px] text-neutral-500">{displayUnit}</span>
        ) : null}
      </div>
    );
  }
  if (control.kind === "toggle") {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 accent-cyan-400"
        checked={Boolean(value)}
        onChange={(event) => write(event.target.checked)}
      />
    );
  }
  if (control.kind === "color") {
    const parsed = parseColor(value);
    const rgb = parsed?.rgb ?? "#000000";
    const alpha = parsed?.alpha ?? 1;
    const showAlpha = control.hasAlpha === true || parsed?.hasAlpha === true;
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-6 w-10 cursor-pointer rounded border border-neutral-600 bg-transparent"
          value={rgb}
          onChange={(event) => {
            if (showAlpha) {
              const a = Math.round(alpha * 255)
                .toString(16)
                .padStart(2, "0");
              write(`${event.target.value}${a}`);
            } else {
              write(event.target.value);
            }
          }}
        />
        {showAlpha ? (
          <input
            type="range"
            className="h-1 w-16 accent-cyan-400"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onChange={(event) => {
              const nextAlpha = Number(event.target.value);
              const a = Math.round(nextAlpha * 255)
                .toString(16)
                .padStart(2, "0");
              write(`${rgb}${a}`);
            }}
          />
        ) : null}
      </div>
    );
  }
  if (control.kind === "select" || control.kind === "enum") {
    const choices =
      control.choices ??
      control.options?.map((option) => ({ value: option, label: String(option) })) ??
      [];
    return (
      <select
        className="rounded-md border border-white/10 bg-black/40 px-1 py-0.5 text-neutral-100"
        value={String(value)}
        onChange={(event) => {
          const match = choices.find((choice) => String(choice.value) === event.target.value);
          if (match !== undefined) write(match.value);
        }}
      >
        {choices.map((choice) => (
          <option key={String(choice.value)} value={String(choice.value)}>
            {choice.label ?? String(choice.value)}
          </option>
        ))}
      </select>
    );
  }
  if (control.kind === "vec2" || control.kind === "vec3" || control.kind === "vec4") {
    const axes = Array.isArray(value) ? (value as number[]) : [];
    const labels = control.axisLabels ?? ["x", "y", "z", "w"];
    return (
      <div className="flex flex-wrap items-center gap-1">
        {axes.map((axis, index) => (
          <label key={labels[index] ?? index} className="flex items-center gap-0.5 text-[10px] text-neutral-400">
            <span>{labels[index]}</span>
            <input
              type="number"
              className="w-14 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-neutral-100"
              min={control.axisMin?.[index]}
              max={control.axisMax?.[index]}
              step={control.axisStep?.[index] ?? control.step}
              value={axis}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isNaN(next)) return;
                const copy = axes.slice();
                copy[index] = next;
                write(copy);
              }}
            />
          </label>
        ))}
      </div>
    );
  }
  if (control.kind === "interval") {
    const interval =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as { min: number; max: number })
        : { min: 0, max: 0 };
    const writeInterval = (min: number, max: number) => write({ min, max });
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="w-14 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-neutral-100"
          min={control.min}
          max={control.max}
          step={control.step}
          value={interval.min}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) writeInterval(next, interval.max);
          }}
        />
        <span className="text-neutral-500">…</span>
        <input
          type="number"
          className="w-14 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-neutral-100"
          min={control.min}
          max={control.max}
          step={control.step}
          value={interval.max}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) writeInterval(interval.min, next);
          }}
        />
      </div>
    );
  }
  return (
    <input
      type="text"
      className="w-32 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 font-mono text-neutral-100"
      value={String(value)}
      onChange={(event) => write(event.target.value)}
    />
  );
}

function formatPreview(value: unknown): string {
  if (typeof value === "number") return String(Math.round(value * 1000) / 1000);
  if (Array.isArray(value)) return value.map((entry) => formatPreview(entry)).join(", ");
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const TUNABLE_ACRONYMS = new Set([
  "fov",
  "fps",
  "ms",
  "ui",
  "ai",
  "id",
  "uv",
  "rgb",
  "rgba",
  "hp",
  "mp",
  "xp",
  "npc",
  "pvp",
  "pve",
  "rts",
  "hud",
  "lod",
  "gpu",
  "cpu",
]);

function humanizeTunableSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const lower = part.toLowerCase();
      if (TUNABLE_ACRONYMS.has(lower)) return lower.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function tunableGroupTitle(table: string, key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot < 0) return humanizeTunableSegment(table);
  const parent = key.slice(0, dot);
  const parts = parent.split(".").map(humanizeTunableSegment);
  return `${humanizeTunableSegment(table)} · ${parts.join(" · ")}`;
}

function tunableRowLabel(key: string): string {
  const leaf = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
  return humanizeTunableSegment(leaf);
}

function tunableGroupKey(table: string, key: string): string {
  const dot = key.lastIndexOf(".");
  return dot < 0 ? table : `${table}/${key.slice(0, dot)}`;
}

function deltaSnippet(discovered: readonly DiscoveredEntry[]): string | null {
  const overrides = devtools.overrides.export();
  if (Object.keys(overrides.values).length === 0) return null;
  const discoveredById = new Map(discovered.map((entry) => [entry.id, entry]));
  const tables = new Map<string, Record<string, unknown>>();
  const flat: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(overrides.values)) {
    const entry = discoveredById.get(name);
    if (entry !== undefined) {
      const values = tables.get(entry.table) ?? {};
      values[entry.key] = value;
      tables.set(entry.table, values);
    } else {
      flat[name] = value;
    }
  }
  const parts: string[] = [];
  for (const [table, values] of tables) parts.push(`${table}: ${JSON.stringify(values, null, 2)}`);
  if (Object.keys(flat).length > 0) parts.push(`controls: ${JSON.stringify(flat, null, 2)}`);
  return parts.join("\n\n");
}

function tunableDeltas(
  discovered: readonly DiscoveredEntry[],
): { table: string; key: string; value: unknown }[] {
  const overrides = devtools.overrides.export();
  const discoveredById = new Map(discovered.map((entry) => [entry.id, entry]));
  const deltas: { table: string; key: string; value: unknown }[] = [];
  for (const [name, value] of Object.entries(overrides.values)) {
    const entry = discoveredById.get(name);
    if (entry !== undefined) deltas.push({ table: entry.table, key: entry.key, value });
  }
  return deltas;
}

type SourceSaveState = "idle" | "saving" | "saved" | "partial" | "error";

function SaveToSourceButton({ discovered }: { discovered: readonly DiscoveredEntry[] }) {
  const [state, setState] = useState<SourceSaveState>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const endpoint = getSaveEndpoint();
  if (endpoint === null) return null;
  const deltas = tunableDeltas(discovered);
  const save = () => {
    if (deltas.length === 0 || state === "saving") return;
    setState("saving");
    void fetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "tunables", gameId: endpoint.gameId, deltas }),
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          ok: boolean;
          applied?: number;
          skipped?: readonly { table: string; key: string; reason: string }[];
          error?: string;
        };
        if (!result.ok) {
          setState("error");
          setDetail(result.error ?? "save failed");
          return;
        }
        const skipped = result.skipped ?? [];
        if (skipped.length > 0) {
          setState("partial");
          setDetail(skipped.map((entry) => `${entry.table}/${entry.key}: ${entry.reason}`).join("\n"));
        } else {
          setState("saved");
          setDetail(null);
        }
        setTimeout(() => setState("idle"), 2500);
      })
      .catch((error: unknown) => {
        setState("error");
        setDetail(error instanceof Error ? error.message : String(error));
      });
  };
  return (
    <button
      type="button"
      disabled={deltas.length === 0}
      className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-cyan-200 ring-1 ring-inset ring-cyan-400/25 transition-colors hover:bg-cyan-500/25 disabled:opacity-40 disabled:hover:bg-cyan-500/15"
      onClick={save}
      title={detail ?? "Write changed values back into the game's source files"}
    >
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved to source"
          : state === "partial"
            ? "Saved (some skipped)"
            : state === "error"
              ? "Save failed"
              : `Save to source${deltas.length > 0 ? ` (${deltas.length})` : ""}`}
    </button>
  );
}

export function TunePanel({ gameName }: { gameName: string }) {
  const [deltasCopied, setDeltasCopied] = useState(false);
  const [query, setQuery] = useState("");
  const controls = devtools.controls.list();
  const allDiscovered = devtools.discover.list();
  const persist = () => persistDevtoolsOverrides(gameName);
  const discoveredIds = new Set(allDiscovered.map((entry) => entry.id));
  const needle = query.trim().toLowerCase();
  const matches = (id: string) => needle === "" || id.toLowerCase().includes(needle);
  const discovered = allDiscovered.filter((entry) => entry.enabled || matches(entry.id));
  const explicit = controls.filter((control) => !discoveredIds.has(control.name) && matches(control.name));
  const controlByName = new Map(controls.map((control) => [control.name, control]));
  const snippet = deltaSnippet(allDiscovered);
  const copyDeltas = () => {
    if (snippet === null) return;
    const clipboard = navigator.clipboard;
    if (clipboard !== undefined) {
      void clipboard.writeText(snippet).catch(() => console.log(snippet));
    } else {
      console.log(snippet);
    }
    setDeltasCopied(true);
    setTimeout(() => setDeltasCopied(false), 1500);
  };
  if (controls.length === 0 && allDiscovered.length === 0) {
    return (
      <div className="space-y-2 text-neutral-400">
        <div>Nothing discovered.</div>
        <div className="font-mono text-[10px] text-neutral-500">
          {"export const TUNING = { gravity: -22, skyColor: \"#87ceeb\" };"}
          <br />
          {"Nested numbers/booleans/colors auto-discover. Schema kinds:"}
          <br />
          {"vec2/3/4 · interval · angle · enum · color+alpha via tunable() or scan meta."}
        </div>
      </div>
    );
  }
  const groups = new Map<string, { title: string; entries: DiscoveredEntry[] }>();
  for (const entry of discovered) {
    const groupKey = tunableGroupKey(entry.table, entry.key);
    const existing = groups.get(groupKey);
    if (existing !== undefined) {
      existing.entries.push(entry);
    } else {
      groups.set(groupKey, { title: tunableGroupTitle(entry.table, entry.key), entries: [entry] });
    }
  }
  return (
    <div className="jg-devtools-scroll max-h-72 space-y-3 overflow-auto">
      <div className="flex gap-1.5">
        <button
          type="button"
          className="rounded-md bg-white/[0.04] px-2 py-0.5 text-neutral-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/10"
          onClick={() => {
            devtools.controls.resetAll();
            persist();
          }}
        >
          Reset all
        </button>
        <button
          type="button"
          disabled={snippet === null}
          className="rounded-md bg-white/[0.04] px-2 py-0.5 text-neutral-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={copyDeltas}
          title="Copy changed values as source snippets to paste upstream"
        >
          {deltasCopied ? "Copied" : "Copy deltas"}
        </button>
        <SaveToSourceButton discovered={allDiscovered} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="filter…"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-neutral-200 transition-colors placeholder:text-neutral-600 focus:border-cyan-400/60 focus:outline-none"
        />
      </div>
      {explicit.length === 0 && discovered.length === 0 ? (
        <div className="text-neutral-500">No tunables match “{query}”.</div>
      ) : null}
      {explicit.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-wide text-neutral-500">registered</div>
          {explicit.map((control) => (
            <div key={control.name} className="flex items-center justify-between gap-3">
              <span className="text-neutral-300" title={control.name}>
                {control.label.includes(".") ? tunableRowLabel(control.label) : control.label}
              </span>
              <ControlInput control={control} onWrite={persist} />
            </div>
          ))}
        </div>
      ) : null}
      {[...groups.entries()].map(([groupKey, group]) => (
        <div key={groupKey} className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-wide text-neutral-500">{group.title}</div>
          {group.entries.map((entry) => {
            const control = entry.enabled ? controlByName.get(entry.id) : undefined;
            return (
              <div key={entry.id} className="flex items-center justify-between gap-3">
                <label className="flex min-w-0 items-center gap-1.5 text-neutral-300" title={entry.id}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 shrink-0 accent-cyan-400"
                    checked={entry.enabled}
                    onChange={(event) => {
                      if (event.target.checked) devtools.discover.enable(entry.id);
                      else devtools.discover.disable(entry.id);
                      persist();
                    }}
                  />
                  <span className="truncate">{tunableRowLabel(entry.key)}</span>
                </label>
                {control !== undefined ? (
                  <ControlInput control={control} onWrite={persist} />
                ) : (
                  <span className="font-mono text-neutral-500">{formatPreview(entry.read())}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
