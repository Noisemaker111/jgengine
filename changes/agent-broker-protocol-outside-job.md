The dev broker no longer dies under other runs when an older checkout started it

### Fixed

- Runs no longer lose their dev server and browser mid-flow because an older checkout started the shared dev broker inside its own fairshare slot. The broker protocol is now 2, meaning "runs outside its starter's job". A run passes by a busy protocol 1 broker with its own servers, and replaces an idle one. On 2026-11-08 the broker died silently 15 times in 3 hours, each time right after a run from a checkout without #3056
