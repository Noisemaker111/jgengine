import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatPanel } from "./chat";

const messages = Array.from({ length: 5 }, (_, index) => ({ id: String(index), channelId: "world", fromUserId: index === 4 ? "me" : "neighbor", body: `message-${index}`, at: index }));
test("standalone chat preserves collapsed history, own-message variant and editable input", () => {
  const html = renderToStaticMarkup(createElement(ChatPanel, { messages, userId: "me", onSend: () => ({ ok: true }), collapsedLimit: 3, ownMessageClassName: "own" }));
  expect(html).not.toContain("message-1");
  expect(html).toContain("message-2");
  expect(html).toContain('data-own-message="true"');
  expect(html).toContain('class="own"');
  expect(html).toContain('aria-label="Chat message"');
});
test("expanded chat renders the configured history without a GameProvider", () => {
  const html = renderToStaticMarkup(createElement(ChatPanel, { messages, userId: "me", onSend: () => ({ ok: true }), defaultExpanded: true, limit: 5 }));
  expect(html).toContain("message-0");
  expect(html).toContain('data-expanded="true"');
});
