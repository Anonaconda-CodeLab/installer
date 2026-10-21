// Test-only wrapper around src/apps.js: when window.__mock.officialSha is set,
// pretends Lead One ECG 1.0.0 was released with that checksum.
import * as real from "../src/apps.js";

const sha = globalThis.window?.__mock?.officialSha;
export const OFFICIAL_APPS = sha
  ? real.OFFICIAL_APPS.map((app) =>
      app.id === "lead-one-ecg"
        ? { ...app, releases: [{ version: "1.0.0", file: "lead-one-ecg-1.0.0.apk", sha256: sha }] }
        : app,
    )
  : real.OFFICIAL_APPS;

export function findOfficialBuild(sha256) {
  for (const app of OFFICIAL_APPS) {
    for (const release of app.releases) {
      if (release.sha256 === sha256.toLowerCase()) return { app, release };
    }
  }
  return null;
}

export function hasAnyRelease() {
  return OFFICIAL_APPS.some((app) => app.releases.length > 0);
}
