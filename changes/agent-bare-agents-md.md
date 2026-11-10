Reduced repo agent rules and restored Claude loading

Engine seam: none - game content only

### Changed

- Reduced repo agent rules and restored Claude loading
- Removed nested rule files; retained a 2,726-byte root guide and a CLAUDE.md containing only @AGENTS.md
- Updated game and skill references to the surviving guidance; no runtime code changed
- Validation: setup and every documented command or its --help passed; skill-doc tests passed; links and the size target passed; verify-fast caught its injected regression
