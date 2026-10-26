import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createCameraShake } from "@jgengine/core/camera/shake/cameraShake";

import { CameraShakeMeter } from "./cameraShake.view";

describe("camera shake meter", () => {
  test("reads the controller's trauma without driving it", () => {
    const shake = createCameraShake({});
    shake.add(0.5, "explosion");
    const html = renderToStaticMarkup(<CameraShakeMeter controller={shake} />);
    expect(html.length).toBeGreaterThan(0);
    expect(shake.trauma()).toBeCloseTo(0.5);
  });
});
