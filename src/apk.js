// Local checks on the chosen file. Nothing here leaves the computer.

const BUNDLE_EXTENSIONS = [".apks", ".xapk", ".apkm", ".aab"];

/** Returns null if the file looks like a single APK, or a plain-English problem. */
export async function checkApkFile(file) {
  const name = file.name.toLowerCase();
  if (BUNDLE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return {
      title: "This is an app bundle, not a single APK",
      detail: "Files ending in .apks, .xapk, .apkm or .aab hold several pieces. This installer handles single .apk files only.",
    };
  }
  if (file.size === 0) {
    return { title: "This file is empty", detail: "Download it again and choose the new copy." };
  }
  // APKs are ZIP files and start with "PK\x03\x04".
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) {
    return {
      title: "This isn't an Android app file",
      detail: "Choose a file ending in .apk. If it is one, it may be damaged; download it again.",
    };
  }
  return null;
}

/** SHA-256 of the whole file, as 64 lowercase hex characters. */
export async function sha256Hex(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tidies a pasted checksum: drops spaces, colons and a "sha256:" prefix. */
export function normaliseChecksum(text) {
  return text.trim().toLowerCase().replace(/^sha-?256[:=\s]*/, "").replace(/[\s:]/g, "");
}

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
