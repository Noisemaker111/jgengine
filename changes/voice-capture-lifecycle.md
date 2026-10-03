### Fixed

- Retire microphone grants arriving after voice-hook unmount, channel/transport replacement, or a newer permission request. Stop replaced capture tracks, preserve accepted capture on transport changes or failed retries, reject ended audio grants and callbacks retained from retired channels, and handle publication failures without unhandled rejections or stale microphone updates.
