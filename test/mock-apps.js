// Test-only wrapper around src/apps.js. Set by the test before the page loads:
//   window.__mock.officialSha  -> pretend Lead One ECG 1.0.0 is the latest release, with that checksum
//   window.__mock.studioCert   -> pretend the studio certificate has this SHA-256
// The certificate is still read from the file by the real code in src/apk.js.
import * as real from "../src/apps.js";

const mock = globalThis.window?.__mock ?? {};

export const STUDIO_CERT_SHA256 = mock.studioCert ?? real.STUDIO_CERT_SHA256;

export const OFFICIAL_APPS = mock.officialSha
  ? real.OFFICIAL_APPS.map((app) =>
      app.id === "lead-one-ecg"
        ? { ...app, release: { version: "1.0.0", file: "lead-one-ecg-1.0.0.apk", sha256: mock.officialSha } }
        : app,
    )
  : real.OFFICIAL_APPS;

export function findOfficialBuild(sha256) {
  const app = OFFICIAL_APPS.find((a) => a.release?.sha256 === sha256.toLowerCase());
  return app ? { app, release: app.release } : null;
}

export function isStudioSigned(certs) {
  return Array.isArray(certs) && certs.length > 0 && certs.every((c) => c === STUDIO_CERT_SHA256);
}

export function hasAnyRelease() {
  return OFFICIAL_APPS.some((app) => app.release);
}
