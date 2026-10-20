### Added

- `ctx.game.notices` (`@jgengine/core/game/notices`, `createNoticeFeed`): a player-facing notice feed with info/success/warn/deny tones, stacking dedupe (repeats show ×N and refresh their lifetime), a cap, TTL, `onPush`, `retune` and `snapshot`/`restore`. Pure state on the context clock, so headless and hosted runs are unaffected.
- The shell mounts `NoticeStack` (`@jgengine/react/notices`) for every game: animated toned cards below top HUD bars, 14px text on `--jg-*` vars with fallbacks, no pointer capture. Configure with `notices: { placement, hidden, refusals, cues, cap, ttlMs }` or remove with `notices: false`.
- Refusal feedback: `validate` may return `{ reason, message }`. `reason` stays the machine code; a `message` is shown automatically as a deduped deny notice with the deny cue when the local player's command is refused, locally or from a host. `ctx.game.commands` emits a `command.refused` event for every refusal; `attachRefusalNotices` is the headless hookup.
- UI sound cues: `useUiCue()` / `playUiCue` (`@jgengine/react/uiCues`) play `click`, `hover`, `open`, `close`, `confirm`, `deny`, `notify`. Soft procedural defaults (`@jgengine/core/audio/uiCues`) mix on a new "ui" bus with a "UI volume" setting under master volume. A game sound named `ui.<cue>` replaces one; `audio.uiCues` overrides or silences cues (`false` for all).
- `notice_push` and `run_command` agent-bridge verbs for `drive --rpc`.
- `ui-feedback` dev probe (apps/dev) exercising refusals, the feed and cues.

### Changed

- `CommandRejection`, `CommandValidationError`, `CommandResult`, `RunCommandResult` and `TransportRunCommandResult` carry an optional `message`; the ws hosts forward it. Results without one are unchanged.
