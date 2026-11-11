import { expect, test } from "bun:test";
import { nativeFieldKey } from "./nativeSurface.view";

test("an edited native field owns every key before captures, back and navigation; Escape and Tab leave it",() => {
  for (const code of ["KeyW","KeyP","Enter","Space","ArrowLeft","ArrowDown","Backspace"]) expect(nativeFieldKey(code,true)).toBe("field");
  expect(nativeFieldKey("Escape",true)).toBe("leave");
  expect(nativeFieldKey("Tab",true)).toBe("leave-navigate");
  for (const code of ["KeyW","Escape","Tab"]) expect(nativeFieldKey(code,false)).toBeNull();
});
