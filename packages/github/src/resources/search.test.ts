import { describe, expect, test } from "bun:test";

import { buildQuery } from "./search";

describe("buildQuery", () => {
  test("joins key:value qualifiers with spaces", () => {
    expect(buildQuery({ author: "x", type: "pr" })).toBe("author:x type:pr");
  });

  test("skips undefined values", () => {
    expect(buildQuery({ author: "x", type: "pr", is: undefined })).toBe("author:x type:pr");
  });

  test("supports numeric values", () => {
    expect(buildQuery({ comments: 5, author: "x" })).toBe("comments:5 author:x");
  });

  test("returns an empty string for no parts", () => {
    expect(buildQuery({})).toBe("");
  });
});
