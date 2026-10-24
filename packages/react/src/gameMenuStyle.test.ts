import { expect, test } from "bun:test";

import type { CSSProperties } from "react";

import type { GameMenuProps, GameMenuStyle } from "./gameMenu";

/**
 * A game owns its menu's look and often already holds a `CSSProperties` object. 0.38.2 typed
 * `style` as `CSSProperties & Record<`--${string}`, ...>`, which a `CSSProperties` value cannot
 * satisfy, so Harbor Heat and Beacon Bastion stopped typechecking on a patch release. These
 * assignments are compiled by `check-types`: both must stay assignable to the prop.
 */
const tokens: GameMenuStyle = { "--jg-menu-surface-radius": "12px" };
const plain: CSSProperties = { padding: 12, gap: 4 };
const fromPlain: NonNullable<GameMenuProps["style"]> = plain;
const fromTokens: NonNullable<GameMenuProps["style"]> = tokens;
const detailFromPlain: NonNullable<GameMenuProps["detailStyle"]> = plain;

test("a game's CSSProperties and a token object both type the menu's style", () => {
  expect([fromPlain, fromTokens, detailFromPlain].every((value) => value !== null)).toBe(true);
  expect(fromPlain).toBe(plain);
});
