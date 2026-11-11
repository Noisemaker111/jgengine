import { expect, test } from "bun:test";
import { act } from "@jgengine/core/ui/jsx";
import { nativeEnabled, nativeLabel, visibleNativeNodes, type RuneNode } from "@jgengine/core/ui/rune/nativeTree";
import { uiCueSoundId } from "@jgengine/core/ui/uiCues";
import { mountRuneUi } from "../../../../proofs/runeUiFixture";

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });

function pressable(surface: RuneNode, label: string): RuneNode {
  const node = visibleNativeNodes(surface).find((entry) => entry.props.onPress !== undefined && nativeEnabled(entry) && nativeLabel(entry) === label);
  if (node === undefined) throw new Error(`No pressable "${label}" on screen; have ${visibleNativeNodes(surface).filter((entry) => entry.props.onPress !== undefined).map((entry) => `${nativeLabel(entry)}${nativeEnabled(entry) ? "" : " (off)"}`).join(", ")}`);
  return node;
}

function keyTarget(surface: RuneNode): RuneNode {
  const node = [...visibleNativeNodes(surface)].reverse().find((entry) => entry.props.onKey !== undefined);
  if (node === undefined) throw new Error("No node takes keys");
  return node;
}

test("the title's main buttons each play the menu confirm cue", async () => {
  const ui = mountRuneUi("title");
  try {
    const played: string[] = [];
    ui.ctx.game.events.on("audio.play", ({ sound }) => played.push(sound));
    for (const label of ["New Defense", "Back", "Keeps", "Back", "Settings", "Back", "Credits", "Back"]) {
      await settle();
      const before = played.length;
      await act(() => pressable(ui.surface, label).props.onPress?.());
      expect(played.slice(before), label).toEqual([uiCueSoundId("confirm")]);
    }
  } finally { ui.dispose(); }
});

test("a commander name typed on the keyboard is sealed into the commission", async () => {
  const ui = mountRuneUi("new");
  try {
    await settle();
    await act(() => pressable(ui.surface, "Commander name").props.onPress?.());
    for (const code of ["KeyA", "KeyD", "KeyA", "Space", "KeyR", "KeyO", "KeyO", "KeyK", "KeyX", "Backspace"]) {
      await settle();
      await act(() => keyTarget(ui.surface).props.onKey?.(code));
    }
    await settle();
    expect(JSON.stringify(ui.spec())).toContain("Ada Rook|");
    await act(() => keyTarget(ui.surface).props.onKey?.("Enter"));
    await settle();
    const sealed = JSON.stringify(ui.spec());
    expect(sealed).toContain("Ada Rook");
    expect(sealed).not.toContain("Ada Rook|");
    expect(visibleNativeNodes(ui.surface).some((entry) => entry.props.onKey !== undefined)).toBe(false);
  } finally { ui.dispose(); }
});
