# Changelog

## 0.2.0 (not yet published)

- Lists all five studio apps (Lead One ECG, Rounds, Still Point, Unmarked, Flatbed) with their latest releases,
  a direct "Download" link to each release's APK, and "Install page ↗" in a new tab (a deliberate exception to the
  studio's same-tab rule: leaving the page would drop the phone's USB connection).
- "One of our apps" installs a file only when its SHA-256 matches the app's latest release and it is signed with the
  studio certificate. Both paths show the file's signing certificate ("as stated in the file" for other apps).
- Installs the exact bytes that were checked; a slow check can no longer replace a newer choice.
- Security: Trusted Types, `connect-src 'none'`, HSTS, Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy;
  the `*.pages.dev` address is kept out of search engines.
- Help: phone-to-phone tips from real-phone testing; "Always allow" only on your own computer.
- File names, checksums, certificates, the phone's name and its messages are kept from browser translators.

## 0.1.0

- First version: browser-based APK installer over WebUSB (Tango), with a verified path for the studio's apps and a
  separate, warned path for any other APK. Not published.
