Owns lock-before-dev-server/browser for fps-gap, audits, desktop: every perf script that takes the lock (play, gate, fps-gap, shadow-audit and the audits that share its loop, network, desktop, native, timing, drive --hitches/--trace) takes it before it asks for a dev server or launches a browser or app; #3083 and #3087 drop their copies when they rebase

### Added

- perf runs queue machine-wide. A queued run prints 'perf lock: waiting for pid <n> (<branch>: <run>, since <hh:mm>) …' once, waiters go in arrival order, its guard does not count the wait, and its record says the seconds it waited
- perf, drive and shoot, and the Chrome they start, run below normal priority so Jon's game and editor come first. Only the Chrome or desktop app a mode measures goes back to normal (decided per mode in scripts/perf.ts), and each record says the priority its Chrome drew at. verify:fast, lane:close, check and test stay at normal: at below normal, starved tests failed four landings in a row
- a capture's Chrome dies with its launcher. A detached watchdog (scripts/chrome-watchdog.ts) ends Chrome's tree and removes its profile within about a second of the launcher being force-killed, and logs every outcome to jg-chrome-watchdog.log in the temp folder

### Changed

- Owns lock-before-dev-server/browser for fps-gap, audits, desktop: every perf script that takes the lock (play, gate, fps-gap, shadow-audit and the audits that share its loop, network, desktop, native, timing, drive --hitches/--trace) takes it before it asks for a dev server or launches a browser or app; #3083 and #3087 drop their copies when they rebase

### Fixed

- a perf run no longer fails on ERR_CONNECTION_REFUSED after a long lock wait; a test fails any script that takes the perf lock and fetches a dev server outside it
- verify:fast reruns once the test files of a step whose every failure is a timeout (a starved run on a busy PC) and prints a degraded line; a real hang still fails. Browser tests that symlink into a fixed scratch folder clear it first, so a rerun after a killed run does not fail on EEXIST. Also: a failing browser-process listing prints a degraded line, and the capture-readiness, headRevision, guard, harness-parity and land.test limits no longer depend on a fast, idle PC
