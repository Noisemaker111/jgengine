editor capture waits for its viewport and finished loading

Root cause: standalone capture never started the readiness gate, and argument dispatch ignored help and unknown options

### Fixed

- editor capture waits for its viewport and finished loading
- editor and asset provisioning help reject invalid options before changing files
