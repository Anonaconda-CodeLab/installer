# Anonaconda Installer

A free, browser-based installer for Android apps, from Anonaconda Code Lab.
Plug a phone into a computer with a USB cable, choose an APK, and install it.
It will live at **install.anonacondacodelab.com**.

Google is rolling out developer verification for Android apps (Brazil,
Indonesia, Singapore and Thailand from September 2026; worldwide in 2027).
Installing over USB with ADB still works for apps from developers who haven't
registered, and this page makes that easy. We support
[Keep Android Open](https://keepandroidopen.org).

**Status:** in testing, not published.

## How it works

- Chrome, Edge or another Chromium browser talks to the phone over **WebUSB**,
  using [Tango (ya-webadb)](https://github.com/yume-chan/ya-webadb) (MIT).
- It's a plain static site: no server code, no tracking, no cookies, no
  third-party requests (fonts are self-hosted). The APK goes straight from the
  computer to the phone; nothing is uploaded.
- Two paths:
  1. **Our apps** (Lead One ECG, Rounds, Still Point, Unmarked, Flatbed): the
     file's SHA-256 must match the app's latest release in `src/apps.js`, and
     its signing certificate must be the studio's (`STUDIO_CERT_SHA256`). Only
     then does it show "Verified, official build" and can be installed.
  2. **Any other app**: clearly separated, with a warning that we can't vouch
     for it. Shows the file's SHA-256 and signing certificate, lets you paste
     the publisher's checksum to compare, and needs a tick box before installing.
- Phone errors (`INSTALL_FAILED_…`) and connection problems are translated into
  plain English (`src/errors.js`).

## Develop

```sh
npm install
npm run dev      # http://localhost:8000, rebuilds on change
npm run build    # static site in dist/
```

WebUSB needs a secure context: `localhost` or HTTPS.

## Test

```sh
node test/build-test.mjs        # page with a simulated phone
python3 test/ui_test.py [dir]   # Playwright; optional dir for screenshots
```

The UI test uses a fake phone (`test/mock-adb.js`), so it checks the page's
logic, not real USB. Its test APKs carry a made-up v2 signing block, so the
certificate is read by the real code. Test with real phones by hand.

## Releasing an app

`src/apps.js` lists only each app's latest release. When an app has a new
release, replace its entry:

```js
release: { version: "1.8.4", file: "LeadOne-ECG-1.8.4.apk", sha256: "…64 hex characters…" },
```

The "Download" link is built from `repo`, the version and `file`
(`…/releases/download/v<version>/<file>`), so the tag must be `v` + version.
Copy the SHA-256 from the tagged release's `.sha256` file, not from a local
build, and check the APK is signed with the studio certificate
(`apksigner verify --print-certs`). A new app also needs `installPage` set.

## Before publishing

- [x] Latest releases, SHA-256s and install pages for all five apps in `src/apps.js`; certificate checked
- [x] One-line description for Still Point
- [x] Phone-to-phone install tested (Pixel 7a on GrapheneOS as host, Pixel 6 Pro as target)
- [ ] Choose hosting for install.anonacondacodelab.com and check the security headers are served
- [ ] Screenshots reviewed before anything goes on the studio homepage

## Hosting

Cloudflare Pages, as for the studio's other apps with a build step: production
branch `main`, framework preset None, build command `node build.mjs`, output
directory `dist`, environment variable `NODE_VERSION=22`. Cloudflare installs
the dependencies from `package-lock.json` before building. Elsewhere, build with
`npm ci && npm run build`, so the exact locked versions are used.

`public/_headers` sets the security headers (including `frame-ancestors 'none'`,
which a `<meta>` tag can't set) and keeps the `*.pages.dev` address out of search
engines. On a host that doesn't read `_headers`, set the same headers in its
config.

Keep install.anonacondacodelab.com for the Installer only. The browser's USB key
(the one phones "Always allow") is stored per web address, so anything else
served there could read it.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE). Third-party licences are collected in
`THIRD_PARTY_NOTICES.txt` at build time.

Always free. If it helps you: [ko-fi.com/anonacondacodelab](https://ko-fi.com/anonacondacodelab).
