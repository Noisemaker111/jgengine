// The GameUI a new game starts from, drawn on Rune like every game in the repo: a theme the game owns,
// the title and pause menus over the game-flow commands, a notice feed, and a HUD slot per template.

/** The theme every template starts from; `src/game/ui/theme.ts` is the game's to restyle. */
export const runeThemeTs = `import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";

/** This game's look on Rune: its colours, named text styles and surfaces. Restyle it from src/art-direction.md. */
export const theme = {
  colors: { ink: "#f3ead8", dim: "#c9bda6", accent: "#d9822b", panel: "#1d1306e6", track: "#ffffff22", good: "#7bc47f", warn: "#e0a43a" },
  text: {
    body: { size: 15, color: "#f3ead8" },
    small: { size: 13, color: "#c9bda6" },
    title: { size: 34, weight: 700, color: "#f3ead8" },
    heading: { size: 18, weight: 650, color: "#f3ead8" },
    button: { size: 16, weight: 650, color: "#1d1306" },
  },
  variants: {
    panel: { padding: 22, gap: 10, fill: "#1d1306e6", border: { width: 1, color: "#d9822b66" }, radius: 12 },
    chip: { padding: [6, 14, 6, 14], fill: "#1d1306d9", radius: 999 },
    button: { minHeight: 42, padding: [10, 20, 10, 20], fill: "#d9822b", radius: 8, hover: "#ffffff22", press: "#00000033", items: "center", justify: "center" },
    quiet: { minHeight: 38, padding: [8, 16, 8, 16], border: { width: 1, color: "#d9822b88" }, radius: 8, hover: "#ffffff14", press: "#00000033", items: "center", justify: "center" },
  },
  motion: { duration: 160, distance: 10, bounce: 0 },
} satisfies RuneTheme;
`;

interface RuneGameUiOptions {
  name: string;
  /** One line under the title. */
  pitch?: string | undefined;
  /** [key, what it does] rows on the title. */
  controls: readonly (readonly [string, string])[];
  /** Imports the HUD needs, one per line. */
  hudImports?: readonly string[] | undefined;
  /** The body of `function Hud()`, which returns its Rune views. */
  hud: string;
}

/** `src/game/ui/GameUI.tsx` for a game on the game-flow system: title, pause, HUD and notices on one Rune surface. */
export function runeFlowGameUiTsx(options: RuneGameUiOptions): string {
  const controls = options.controls.map(([key, what]) => `  [${JSON.stringify(key)}, ${JSON.stringify(what)}],`).join("\n");
  return `/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import { continueGame, newGame } from "@jgengine/core/game/gameFlow";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { RuneAction, RuneLabel, RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
${(options.hudImports ?? []).join("\n")}${options.hudImports === undefined || options.hudImports.length === 0 ? "" : "\n"}
import { theme } from "./theme";

// ${options.name}'s screens on one Rune surface: the title, the pause menu, the HUD and the notice feed.
// The words and the look (./theme.ts) are this game's; the verbs are the game-flow commands.
const CONTROLS: readonly (readonly [string, string])[] = [
${controls}
];

function Button({ label, run }: { label: string; run: () => void }) {
  return <RuneAction variant="button" label={label} run={run}><RuneLabel textStyle="button" value={label} /></RuneAction>;
}

function Title() {
  const ctx = useGameContext();
  return (
    <RuneView anchor="center" variant="panel" width={420} gap={14}>
      <RuneLabel textStyle="title" value=${JSON.stringify(options.name)} />
${options.pitch === undefined ? "" : `      <RuneLabel value=${JSON.stringify(options.pitch)} />\n`}      <RuneView gap={4}>
        {CONTROLS.map(([key, what]) => <RuneView layout="row" gap={10} items="center"><RuneLabel textStyle="heading" width={70} value={key} /><RuneLabel textStyle="small" value={what} /></RuneView>)}
      </RuneView>
      <RuneView layout="row" gap={10}>
        <Button label="New game" run={() => void newGame(ctx, () => location.reload())} />
        <RuneAction variant="quiet" label="Continue" run={() => void continueGame(ctx)}><RuneLabel value="Continue" /></RuneAction>
      </RuneView>
    </RuneView>
  );
}

function Paused() {
  return (
    <RuneView anchor="fill" fill="#00000088" modal>
      <RuneView anchor="center" variant="panel" width={320} gap={12}>
        <RuneLabel textStyle="heading" value="Paused" />
        <RuneAction variant="button" label="Resume" command={{ name: "pause" }}><RuneLabel textStyle="button" value="Resume" /></RuneAction>
        <RuneAction variant="quiet" label="Save" command={{ name: "save" }}><RuneLabel value="Save" /></RuneAction>
      </RuneView>
    </RuneView>
  );
}

function Hud() {
${options.hud}
}

/** @internal */
export function GameUI() {
  const ctx = useGameContext();
  const phase = useGameStore((game) => gamePhase(game));
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  return (
    <RuneRoot context={ctx} theme={theme}>
      {phase === "menu" ? <Title /> : <Hud />}
      {phase === "paused" ? <Paused /> : null}
      <RuneView anchor="top" safe inset={16} gap={6} items="center">
        <RuneTransient source={notices} expire={ctx.game.notices.prune}>{(notice) =>
          <RuneView variant="chip"><RuneLabel value={notice.text} /></RuneView>}
        </RuneTransient>
      </RuneView>
    </RuneRoot>
  );
}
`;
}

/** The starter loop's HUD: rank, energy, the goal and the latest message. */
export const starterHud = `  const energy = useGameStore((ctx) => Math.round(run.read(ctx).energy.pool.current));
  const gathered = useGameStore((ctx) => run.read(ctx).gathered);
  const rank = useGameStore((ctx) => rankOf(run.read(ctx)));
  const message = useGameStore((ctx) => run.read(ctx).message);
  const won = useGameStore((ctx) => run.read(ctx).won);
  return (
    <>
      <RuneView anchor="top-left" safe inset={16} variant="panel" width={260} gap={8}>
        <RuneLabel textStyle="small" value={rank} />
        <RuneLabel textStyle="heading" value={won ? "The beacon is lit" : "Light the beacon"} />
        {won ? null : <RuneLabel textStyle="small" value={"Caches " + Math.min(gathered, GOAL_GATHERED) + " / " + GOAL_GATHERED} />}
        <RuneLabel textStyle="small" value={"Energy " + energy} />
        <RuneView height={6} fill={theme.colors.track} radius={3}>
          <RuneView height={6} radius={3} width={{ fraction: Math.max(0, Math.min(1, energy / ENERGY.max)) }} fill={energy / ENERGY.max < 0.2 ? theme.colors.warn : theme.colors.accent} />
        </RuneView>
      </RuneView>
      {message === "" ? null : <RuneView anchor="top" safe inset={16} variant="chip"><RuneLabel value={message} color={won ? theme.colors.good : theme.colors.ink} /></RuneView>}
    </>
  );`;

export const starterHudImports = ['import { run } from "../../loop";', 'import { ENERGY, GOAL_GATHERED, rankOf } from "../rules";'];

/** The authored scene's HUD: whatever its built-in trigger actions (announce, win, advance) wrote. */
export const editorHud = `  const status = useSyncExternalStore(outcome.subscribe, outcome.get, outcome.get);
  if (status.message === null) return null;
  return (
    <RuneView anchor="top" safe inset={24} variant="chip">
      <RuneLabel value={status.message} color={status.won ? theme.colors.good : status.tone === "warn" ? theme.colors.warn : theme.colors.ink} />
    </RuneView>
  );`;

export const editorHudImports = ['import { useSyncExternalStore } from "@jgengine/core/ui/jsx";', 'import { outcome } from "../../loop";'];

/** A game with no rules yet: an empty HUD to grow. */
export const plainHud = `  // Add this game's HUD here: Rune views anchored on the screen (see the jgengine-ui skill).
  return null;`;

/** `src/game/ui/GameUI.tsx` for a 2D board game: the board drawn on Rune from the store. */
export const runeBoardGameUiTsx = (name: string) => `/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneLabel, RuneRoot, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useStore } from "@jgengine/ui/store";
import { useGameContext } from "@jgengine/ui/provider";

import { board } from "../../loop";
import { theme } from "./theme";

// ${name} draws its own face on Rune. This board is a readable starting point, not a look:
// restyle it from src/art-direction.md and ./theme.ts.

/** @internal */
export function GameUI() {
  const ctx = useGameContext();
  const { grid, cursor } = useStore(board);
  const { width, height } = useRuneViewport();
  const cell = Math.floor(Math.min((height * 0.8) / grid.height, (width * 0.9) / grid.width));
  return (
    <RuneRoot context={ctx} theme={theme}>
      <RuneView anchor="fill" fill="#0b1020" />
      <RuneView anchor="center" gap={14} items="center">
        <RuneView layout="grid" columns={grid.width} gap={1} padding={1} fill="#0f172a" radius={6}>
          {grid.cells.map((value, index) => {
            const here = index === cursor.y * grid.width + cursor.x;
            return <RuneView width={cell} height={cell} fill={value === null ? "#243247" : "#38bdf8"} {...(here ? { border: { width: 2, color: "#fcd34d" } } : {})} />;
          })}
        </RuneView>
        <RuneLabel textStyle="small" value="Arrows or WASD move · Space places" />
      </RuneView>
    </RuneRoot>
  );
}
`;

/** `src/game/ui/GameUI.tsx` for the shared-world template: the global chat on Rune. */
export const runeChatGameUiTsx = `/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import { RuneField, RuneLabel, RuneRoot, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useChat } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { theme } from "./theme";

/** The shared world's chat: the last messages on the global channel and a line to send one. */
export function GameUI() {
  const ctx = useGameContext();
  const messages = useChat("global", { limit: 8 });
  const [draft, setDraft] = useState("");
  return (
    <RuneRoot context={ctx} theme={theme}>
      <RuneView anchor="bottom-left" safe inset={16} variant="panel" width={320} gap={6}>
        {messages.map((message) => (
          <RuneLabel textStyle="small" value={(message.fromLabel ?? message.fromUserId) + ": " + message.body} {...(message.fromUserId === ctx.player.userId ? { color: theme.colors.accent } : {})} />
        ))}
        <RuneField value={draft} placeholder="Say something" onChange={setDraft} onSubmit={() => {
          if (draft.trim() === "") return;
          ctx.game.chat?.send(ctx.player.userId, "global", draft);
          setDraft("");
        }} />
      </RuneView>
    </RuneRoot>
  );
}
`;
