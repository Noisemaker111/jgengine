### Fixed

- Closing BroadcastChannel peer signaling now rejects pending offers instead of leaving guest bootstrap unresolved, allowing the shell to release its guest transport. Closed signaling refuses new work and ignores late answer completions; listener replacement and successful exchanges remain supported.
