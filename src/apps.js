// Official Anonaconda Code Lab apps and their published release checksums.
//
// PLACEHOLDERS: none of these apps is public yet, so every `releases` list is
// empty and the installer shows "Not released yet" for each one.
//
// When an app is released, add one entry per published APK:
//
//   {
//     version: "1.0.0",
//     file: "lead-one-ecg-1.0.0.apk",
//     sha256: "<64 lowercase hex characters, from the tagged release>",
//   },
//
// The SHA-256 must be copied from the app's tagged release (the same value the
// app's install page publishes). A file is shown as "Verified, official build"
// only when its SHA-256 matches one of these entries exactly.

export const OFFICIAL_APPS = [
  {
    id: "lead-one-ecg",
    name: "Lead One ECG",
    blurb: "ECG recorder for the Polar H10 chest strap.",
    installPage: null, // e.g. "https://leadone.anonacondacodelab.com/install"
    releases: [],
  },
  {
    id: "rounds",
    name: "Rounds",
    blurb: "Workout interval timer.",
    installPage: null,
    releases: [],
  },
  {
    id: "still-point",
    name: "Still Point",
    blurb: "",
    installPage: null,
    releases: [],
  },
];

/** Returns { app, release } for a SHA-256 that matches a published build, or null. */
export function findOfficialBuild(sha256) {
  const wanted = sha256.toLowerCase();
  for (const app of OFFICIAL_APPS) {
    for (const release of app.releases) {
      if (release.sha256 && release.sha256.toLowerCase() === wanted) {
        return { app, release };
      }
    }
  }
  return null;
}

export function hasAnyRelease() {
  return OFFICIAL_APPS.some((app) => app.releases.length > 0);
}
