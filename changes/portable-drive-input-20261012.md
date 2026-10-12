### Fixed

- The published CLI and scaffold browser driver restore game keyboard focus before key holds and wait for a rendered frame under the held key. Menu clicks and slow headless rendering no longer silently swallow movement inputs; failed frame sampling releases held keys.
