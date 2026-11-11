import { expect, test } from "bun:test";
import { nativeFieldKey, nextAutoFocusField } from "./nativeSurface.view";
import { RuneNode } from "./nativeTree";

test("an edited native field owns every key before captures, back and navigation; Escape and Tab leave it",() => {
  for (const code of ["KeyW","KeyP","Enter","Space","ArrowLeft","ArrowDown","Backspace"]) expect(nativeFieldKey(code,true)).toBe("field");
  expect(nativeFieldKey("Escape",true)).toBe("leave");
  expect(nativeFieldKey("Tab",true)).toBe("leave-navigate");
  for (const code of ["KeyW","Escape","Tab"]) expect(nativeFieldKey(code,false)).toBeNull();
});

test("an autoFocus field takes the keyboard once when it appears, never a disabled or plain one",() => {
  const field = (props: Record<string, unknown>) => { const node = new RuneNode("rune-field"); node.props = props; return node; };
  const plain = field({}), off = field({ autoFocus: true, disabled: true }), chat = field({ autoFocus: true });
  const seen = new WeakSet<RuneNode>();
  expect(nextAutoFocusField([plain, off, chat], seen)).toBe(chat);
  expect(nextAutoFocusField([plain, off, chat], seen)).toBeNull();
  const reopened = field({ autoFocus: true });
  expect(nextAutoFocusField([plain, reopened], seen)).toBe(reopened);
});
