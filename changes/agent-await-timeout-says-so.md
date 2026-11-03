background await that runs out of time says the task is still running and how to keep waiting (exit 6), instead of also claiming it never reported an exit code

Root cause: the wait's timeout and a dead runner both resolved to no code, and the caller reported both as lost (exit 5). #2922's landing took 9m12s, past a 540 s wait, and the wait said it never reported an exit code although it landed. They are now separate results, using the unused EXIT_TIMEOUT.

### Fixed

- background await that runs out of time says the task is still running and how to keep waiting (exit 6), instead of also claiming it never reported an exit code
