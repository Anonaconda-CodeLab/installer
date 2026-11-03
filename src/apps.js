// Official Anonaconda Code Lab apps: the latest published release of each.
//
// A file is shown as "Verified, official build" only when BOTH
//   - its SHA-256 matches the latest release listed here exactly, and
//   - it is signed with the studio's certificate (STUDIO_CERT_SHA256).
//
// When an app has a new release, replace its `release` entry. Copy the
// SHA-256 from the tagged release's .sha256 file on GitHub, not from a local
// build, and check the new APK's certificate:
//   apksigner verify --print-certs <file>.apk   (Signer #1 certificate SHA-256 digest)

/** SHA-256 of the studio's Android signing certificate, shared by all our apps. */
export const STUDIO_CERT_SHA256 = "4d6cea5894c0d7d8e9ab74bc3a1e9ca547bd40a202b67099af665b297f7a8f47";

export const OFFICIAL_APPS = [
  {
    id: "lead-one-ecg",
    name: "Lead One ECG",
    blurb: "ECG recorder for the Polar H10 chest strap.",
    installPage: "https://leadone.anonacondacodelab.com/android.html",
    release: {
      version: "1.8.3",
      file: "LeadOne-ECG-1.8.3.apk",
      sha256: "e245e6ed09cb736a724fdd0a3d84d327bb1242f2d3dd0650b16feb9f0788709c",
    },
  },
  {
    id: "rounds",
    name: "Rounds",
    blurb: "Workout interval timer.",
    installPage: "https://rounds.anonacondacodelab.com/android.html",
    release: {
      version: "1.4.1",
      file: "Rounds-1.4.1.apk",
      sha256: "f446421f7e130080ee08456c9f0647863b516662b1ecc03ae70a94656955d268",
    },
  },
  {
    id: "still-point",
    name: "Still Point",
    blurb: "Morning HRV, standing test and calm breathing with a chest strap.",
    installPage: "https://stillpoint.anonacondacodelab.com/android.html",
    release: {
      version: "1.0.2",
      file: "StillPoint-1.0.2.apk",
      sha256: "b5048db3e779746c8f1999e4fbb16212e5e09b4b9eabac3410433535671d415f",
    },
  },
  {
    id: "unmarked",
    name: "Unmarked",
    blurb: "Removes hidden data from photos and PDFs.",
    installPage: "https://unmarked.anonacondacodelab.com/android.html",
    release: {
      version: "0.1.5",
      file: "Unmarked-0.1.5.apk",
      sha256: "ff26fde879c8d61c5b0fffc23ca0ee27154de0fa2573f7de815c1abb2588fcb4",
    },
  },
  {
    id: "flatbed",
    name: "Flatbed",
    blurb: "Scans documents to clean, searchable PDFs.",
    installPage: "https://flatbed.anonacondacodelab.com/android.html",
    release: {
      version: "1.0.2",
      file: "Flatbed-1.0.2.apk",
      sha256: "060469e6dac4dc3960aa120cb7abca92725f74a4c735268bfe89dab65bee8bae",
    },
  },
];

/** Returns { app, release } when the SHA-256 is an app's latest release, or null. */
export function findOfficialBuild(sha256) {
  const wanted = sha256.toLowerCase();
  const app = OFFICIAL_APPS.find((a) => a.release?.sha256.toLowerCase() === wanted);
  return app ? { app, release: app.release } : null;
}

/** True when every signer certificate in the file is the studio's. */
export function isStudioSigned(certs) {
  return Array.isArray(certs) && certs.length > 0 && certs.every((c) => c === STUDIO_CERT_SHA256);
}

export function hasAnyRelease() {
  return OFFICIAL_APPS.some((app) => app.release);
}
