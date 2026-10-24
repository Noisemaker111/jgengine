### Fixed

- The publish workflow's last step no longer reports a whole release as unpublished because it ran seconds after `npm publish`. `check:release-artifacts --wait <seconds>` re-checks while the only failures are absent packages (no metadata, version missing, tarball 404) and gives up when the budget runs out; a wrong version in the tarball, a missing subpath or a main entry that will not import still fails on the first check. The 0.37.0 publish run failed this step at 04:48 listing all 13 packages, then npm served every one of them. The step now passes `-- --wait 300`.
