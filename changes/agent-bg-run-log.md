Background jobs started through Git Bash now write their output to the job log

Root cause: the background supervisor opened out.log append-only, and MSYS programs (Git Bash) write nothing to such a handle, so bash jobs' logs came back empty.

### Changed

- Background jobs started through Git Bash now write their output to the job log
