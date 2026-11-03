the capture tool's temp cleanup deletes only browser profiles, never an agent's own jg- folder such as %TEMP%\jg-scratch of screenshots

Root cause: both profile sweeps picked folders by the jg- name prefix alone, so any agent folder under %TEMP% starting with jg- was deleted once it sat 45 minutes, or 5 when the drive was short. A folder now counts as a profile only if it holds the capture's owner file, Chrome's Local State or Default, or nothing.

### Fixed

- the capture tool's temp cleanup deletes only browser profiles, never an agent's own jg- folder such as %TEMP%\jg-scratch of screenshots
