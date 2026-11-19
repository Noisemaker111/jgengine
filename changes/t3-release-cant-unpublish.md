a release stops with "registry did not answer, run again" instead of unpublishing a healthy version when npm answers anything but a confirmed 404

### Fixed

- a release stops with "registry did not answer, run again" instead of unpublishing a healthy version when npm answers anything but a confirmed 404
- the full test suite runs on Windows without symlink rights, and the scatter placement check gives the same answer on Windows and Linux

### Removed

- the PR-video workflow and the GitHub account login it held; post the clip link that `bun run pr:shots` prints
