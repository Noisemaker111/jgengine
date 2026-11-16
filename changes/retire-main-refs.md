Nothing points at the main branch any more, so it can be deleted: the CLI's jgengine upgrade reads CHANGELOG.md from beta, the site's skills link and the credits link go to beta, pr-shots starts its archive from beta, and land, lane:close and the session hooks drop their main and release/* cases. Fixed: npx jgengine upgrade fetches the published changelog from beta; it read the main branch, which no release updates since releases moved to v* tags.

### Changed

- Nothing points at the main branch any more, so it can be deleted: the CLI's jgengine upgrade reads CHANGELOG.md from beta, the site's skills link and the credits link go to beta, pr-shots starts its archive from beta, and land, lane:close and the session hooks drop their main and release/* cases. Fixed: npx jgengine upgrade fetches the published changelog from beta; it read the main branch, which no release updates since releases moved to v* tags.
