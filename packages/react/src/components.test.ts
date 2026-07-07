import { describe, expect, test } from "bun:test";
import { resolveDialogueInvoke, type DialogueChoice } from "./components";

const baseChoice: DialogueChoice = {
  label: "Persuade the marshal",
  invoke: { command: "dialogue.fallback" },
  check: { modifier: 3, dc: 14 },
  onSuccess: { command: "npc.marshal.persuadeSuccess" },
  onFailure: { command: "npc.marshal.persuadeFailure" },
};

describe("resolveDialogueInvoke", () => {
  test("returns the plain invoke when there is no check", () => {
    const choice: DialogueChoice = { label: "Leave", invoke: null };
    expect(resolveDialogueInvoke(choice, null)).toBeNull();
  });

  test("resolves to onSuccess when the roll succeeds", () => {
    const result = { rolls: [15], roll: 15, total: 18, success: true, critical: null } as const;
    expect(resolveDialogueInvoke(baseChoice, result)).toEqual({ command: "npc.marshal.persuadeSuccess" });
  });

  test("resolves to onFailure when the roll fails", () => {
    const result = { rolls: [2], roll: 2, total: 5, success: false, critical: null } as const;
    expect(resolveDialogueInvoke(baseChoice, result)).toEqual({ command: "npc.marshal.persuadeFailure" });
  });

  test("falls back to invoke when onSuccess/onFailure are not set", () => {
    const choice: DialogueChoice = { label: "Ask", invoke: { command: "dialogue.fallback" }, check: { modifier: 0, dc: 10 } };
    const success = { rolls: [15], roll: 15, total: 15, success: true, critical: null } as const;
    const failure = { rolls: [2], roll: 2, total: 2, success: false, critical: null } as const;
    expect(resolveDialogueInvoke(choice, success)).toEqual({ command: "dialogue.fallback" });
    expect(resolveDialogueInvoke(choice, failure)).toEqual({ command: "dialogue.fallback" });
  });
});
