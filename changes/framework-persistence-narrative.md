### Fixed
- Playable peer sessions retry transient world loads, reject unadmitted snapshot reads, and drain accepted router work before the final close save. Hosted-world admission becomes visible after its join save succeeds.

### Added
- `HostRouter.drain()` waits for accepted message handlers and subscription reads; call `close()` first to prevent further work before owned host persistence teardown.

### Migrate
- `WorldGameHost.stop()` now permanently closes admission and ticks, drains accepted operations and saves. Await its completion and construct a new host to restart; failed saves reject the same repeated stop promise.
