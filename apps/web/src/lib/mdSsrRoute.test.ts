import { describe, expect, it } from "bun:test";

import { shouldRouteMdRequestToSsr } from "./mdSsrRoute";

const noFiles = () => false;
const allFiles = () => true;

describe("shouldRouteMdRequestToSsr", () => {
  it("routes a virtual .md route (no file on disk) to SSR", () => {
    // Regression guard for #1507: `/agents.md` must reach SSR, like `.txt`/`.xml`.
    expect(shouldRouteMdRequestToSsr("/agents.md", noFiles)).toBe(true);
  });

  it("leaves a .md file that exists on disk to Vite (static/module handling)", () => {
    expect(shouldRouteMdRequestToSsr("/README.md", allFiles)).toBe(false);
    expect(
      shouldRouteMdRequestToSsr("/src/docs/guide.md", (rel) => rel === "src/docs/guide.md"),
    ).toBe(false);
  });

  it("ignores non-.md requests", () => {
    expect(shouldRouteMdRequestToSsr("/llms-full.txt", noFiles)).toBe(false);
    expect(shouldRouteMdRequestToSsr("/sitemap.xml", noFiles)).toBe(false);
    expect(shouldRouteMdRequestToSsr("/", noFiles)).toBe(false);
  });

  it("never touches Vite-internal module/fs URLs", () => {
    expect(shouldRouteMdRequestToSsr("/@fs/abs/path/to/file.md", noFiles)).toBe(false);
    expect(shouldRouteMdRequestToSsr("/@id/virtual.md", noFiles)).toBe(false);
    expect(shouldRouteMdRequestToSsr("/__manifest.md", noFiles)).toBe(false);
  });

  it("decodes percent-encoded paths before the disk check", () => {
    const exists = (rel: string) => rel === "agents guide.md";
    expect(shouldRouteMdRequestToSsr("/agents%20guide.md", exists)).toBe(false);
    expect(shouldRouteMdRequestToSsr("/other%20doc.md", exists)).toBe(true);
  });

  it("bails safely on malformed encoding or null bytes", () => {
    expect(shouldRouteMdRequestToSsr("/%E0%A4%A.md", noFiles)).toBe(false);
    expect(shouldRouteMdRequestToSsr("/%00.md", noFiles)).toBe(false);
  });
});
