import { expect, test } from "bun:test";

import type { PostProcessingConfig } from "@jgengine/core/render/postProcessing";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";

import { graphicsSettingRows } from "./settingsController";

const rowIds = (postProcessing: PostProcessingConfig | undefined): string[] =>
  graphicsSettingRows(createSettingsStore(null), undefined, postProcessing).map((row) => row.id);

const stageRows = (postProcessing: PostProcessingConfig | undefined): string[] =>
  rowIds(postProcessing).filter((id) => id.startsWith("graphics.post."));

const otherRows = (postProcessing: PostProcessingConfig | undefined): string[] =>
  rowIds(postProcessing).filter((id) => !id.startsWith("graphics.post."));

test("a postfx stage row exists only for a stage the game's chain can build", () => {
  expect(stageRows({ ao: {}, bloom: {}, dof: { focus: 12 } })).toContain("graphics.post.dof");
  expect(stageRows({ ao: {}, bloom: {} })).not.toContain("graphics.post.dof");
});

test("every stage row follows that rule, not just depth of field", () => {
  expect(stageRows({ ao: {}, bloom: {}, dof: {}, aa: "msaa" })).toEqual(["graphics.post.ao", "graphics.post.bloom", "graphics.post.dof"]);
  expect(stageRows({ aa: "smaa", bloom: false, ao: false })).toEqual(["graphics.post.smaa"]);
  expect(stageRows({ aa: false, bloom: false, ao: false })).toEqual([]);
});

test("a game with no post chain gets no stage rows and keeps every other row", () => {
  expect(stageRows(undefined)).toEqual([]);
  expect(stageRows({ enabled: false, ao: {}, bloom: {}, dof: {} })).toEqual([]);
  expect(otherRows(undefined)).toEqual(otherRows({ ao: {}, bloom: {}, dof: { focus: 12 } }));
});
