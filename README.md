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
  1. **Our apps** (Lead One ECG, Rounds, Still Point): the file's SHA-256 is
     checked against the published checksum in `src/apps.js`. Only an exact
     match shows "Verified, official build" and can be installed.
  2. **Any other app**: clearly separated, with a warning that we can't vouch
     for it. Shows the file's SHA-256, lets you paste the publisher's checksum
     to compare, and needs a tick box before installing.
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
logic, not real USB. Test with real phones by hand.

### Testing the "verified" path before release

Every app's `releases` list in `src/apps.js` is empty until it's public. To try
the verified path with a test build, add a temporary entry with that APK's
SHA-256 (`sha256sum app.apk`), and remove it before committing.

## Releasing an app

When an app has a public repo, a tagged release and an install page, add the
release to `src/apps.js`:

```js
releases: [
  { version: "1.0.0", file: "lead-one-ecg-1.0.0.apk", sha256: "…64 hex characters…" },
],
```

and set `installPage`. Copy the SHA-256 from the tagged release, not from a
local build.

## Before publishing

- [ ] Real releases, tags and SHA-256s for Lead One ECG, Rounds and Still Point in `src/apps.js`, each with `installPage` set
- [ ] One-line description for Still Point
- [ ] Phone-to-phone install: test it (Pixel as host), or soften the help answer to say it's untested
- [ ] Choose hosting for install.anonacondacodelab.com and check the security headers are served
- [ ] Screenshots reviewed before anything goes on the studio homepage

## Hosting

`dist/` can go on any static host. `public/_headers` sets security headers on
Netlify and Cloudflare Pages (including `frame-ancestors 'none'`, which a
`<meta>` tag can't set). On other hosts, set the same headers in their config.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE). Third-party licences are collected in
`THIRD_PARTY_NOTICES.txt` at build time.

Always free. If it helps you: [ko-fi.com/anonacondacodelab](https://ko-fi.com/anonacondacodelab).
