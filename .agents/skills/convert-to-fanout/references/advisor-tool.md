# Advisor tool — exact API reference

Beta: include header `anthropic-beta: advisor-tool-2026-03-01` on every request. Available on the Claude API and Claude Platform on AWS; not on Bedrock, Google Cloud, or Foundry. ZDR-eligible.

## Request shape

```python
response = client.beta.messages.create(
    model="claude-sonnet-5",                # executor
    max_tokens=4096,
    betas=["advisor-tool-2026-03-01"],
    tools=[
        {
            "type": "advisor_20260301",
            "name": "advisor",              # must be exactly "advisor"
            "model": "claude-fable-5",      # advisor, billed at this model's rates
            # optional: "max_uses": 3, "max_tokens": 2048,
            # optional: "caching": {"type": "ephemeral", "ttl": "5m"}
        },
        # ... your other tools unchanged
    ],
    messages=messages,
)
```

Model pairing: the advisor must be Sonnet 4.6+ and at least as capable as the executor. Sonnet 5 executor pairs with Fable 5, Mythos 5, Opus 4.8, or Opus 4.7. Invalid pairs return `400 invalid_request_error`.

## How a call runs

1. Executor emits `server_tool_use` with `name: "advisor"` and **empty `input`** — the executor signals timing; the server supplies context. Nothing the executor puts in `input` reaches the advisor.
2. Server runs one advisor inference with the executor's full transcript (your system prompt, tool definitions, prior turns, partial current turn) under an Anthropic-supplied advisor system prompt. The advisor has no tools; its thinking is dropped.
3. Result returns as an `advisor_tool_result` block; the executor continues in the same `/v1/messages` request — no client round trip.

## Result variants — handle both

- `advisor_result` with `text` — plaintext advisors (Opus 4.8 and below).
- `advisor_redacted_result` with `encrypted_content` — **Fable 5 and Mythos 5 advisors return this**. Opaque to you; the server decrypts it into the executor's prompt next turn.

Round-trip the content verbatim on subsequent turns. Advisor failures arrive as `advisor_tool_result_error` (`max_uses_exceeded`, `too_many_requests`, `overloaded`, `prompt_too_long`, `execution_time_exceeded`, `unavailable`); the executor continues without advice and the request itself does not fail.

## Multi-turn rules

- Append the full assistant content (including `advisor_tool_result` blocks) back on every turn.
- Omitting the advisor tool while history contains `advisor_tool_result` blocks → `400`. To cap advisor spend conversation-wide, count calls client-side; at the ceiling remove the tool **and** strip all `advisor_tool_result` blocks from history.
- `stop_reason: "pause_turn"` with a pending advisor call: append the assistant message unchanged (keep the `server_tool_use` block) and re-send with the same tool + beta header; no user message or `tool_result` needed. May pause again — repeat.
- Streaming: the advisor sub-inference does not stream; the executor's stream pauses after the `server_tool_use` block closes and the result arrives as one `content_block_start`.

## Call-rate tuning

- **Haiku executor**: if no advisor call by the end of assistant turn 1, append a plain user-message nudge before turn 2 ("You have not consulted the advisor yet. If the task has a non-obvious design decision or a failure mode you haven't ruled out, call advisor now before committing to an approach."). Measured: +7pp task pass rate on Haiku.
- **Sonnet executor**: the nudge had no measurable effect — skip it; rely on system-prompt guidance.
- **Opus executor**: the nudge slightly *lowered* pass rates — never apply.
- Measure the executor's baseline first-call turn before nudging; a turn-2 nudge on workloads whose natural first call lands at turn 7+ cost 3–4pp. If the system prompt already says "reserve the advisor for genuine uncertainty," skip the nudge — the instructions conflict.
- To force a consult on one request: `tool_choice: {"type": "tool", "name": "advisor"}` (incompatible with extended thinking).

## Billing and caching

- Usage arrives in `usage.iterations[]`: `type: "advisor_message"` iterations bill at advisor rates, `type: "message"` at executor rates. Top-level `usage` covers executor tokens only. Advisor output is typically 400–700 text tokens (1,400–1,800 with thinking).
- Top-level `max_tokens` does not bound the advisor; cap it with `max_tokens` on the tool definition (min 1024).
- Two independent cache layers: executor-side (`advisor_tool_result` blocks cache like any content) and advisor-side (`caching: {"type": "ephemeral", "ttl": "5m" | "1h"}` on the tool definition — an on/off switch, not a breakpoint; the server places boundaries).
- Advisor rate limits draw from the advisor model's bucket and surface as `too_many_requests` inside the tool result; executor rate limits fail the whole request with HTTP 429.
