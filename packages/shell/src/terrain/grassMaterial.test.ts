import { expect, test } from "bun:test";
import * as THREE from "three";

import { createGrassMaterial } from "./grassMaterial";

test("accent tufts take their own tip colour, else the field's tip colour", () => {
  const plain = createGrassMaterial({ colorTip: "#88aa44" });
  expect(plain.uniforms.uAccentColor.value.equals(new THREE.Color("#88aa44"))).toBe(true);
  const accented = createGrassMaterial({ colorTip: "#88aa44", accentColor: "#d8c060" });
  expect(accented.uniforms.uAccentColor.value.equals(new THREE.Color("#d8c060"))).toBe(true);
  expect(accented.material).toBeInstanceOf(THREE.Material);
});
