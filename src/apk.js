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
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
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

// ---------------------------------------------------------------------------
// Signing certificate
//
// Android checks an APK's signature when it installs it; here we only read
// which certificate the file says it is signed with, so it can be compared
// with the one a publisher lists. Reads the APK Signature Scheme v3.1/v3/v2
// block (https://source.android.com/docs/security/features/apksigning/v2).

const SCHEMES = [
  [0x1b93ad61, "v3.1"],
  [0xf05368c0, "v3"],
  [0x7109871a, "v2"],
];
const BLOCK_MAGIC = "APK Sig Block 42";

/**
 * SHA-256 fingerprints (64 lowercase hex characters) of the certificate of
 * each signer, from the newest signature scheme in the file. Returns null if
 * the file has no v2 or later signature, or it can't be read.
 */
export async function signingCertSha256s(bytes) {
  let certs;
  try {
    certs = readSignerCerts(new Uint8Array(bytes));
  } catch {
    return null;
  }
  if (!certs || certs.length === 0) return null;
  const out = [];
  for (const cert of certs) {
    const digest = await crypto.subtle.digest("SHA-256", cert);
    out.push(toHex(new Uint8Array(digest)));
  }
  return [...new Set(out)];
}

/** "4d6cea…" -> "4D:6C:EA:…", the way apksigner and AppVerifier show it. */
export function formatFingerprint(hex) {
  return hex.toUpperCase().replace(/(..)(?!$)/g, "$1:");
}

function readSignerCerts(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u32 = (at) => view.getUint32(at, true);
  const u64 = (at) => {
    if (view.getUint32(at + 4, true) !== 0) throw new Error("too large");
    return view.getUint32(at, true);
  };

  // End of central directory record: within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cd = u32(eocd + 16);
  if (cd < 32 || cd > buf.length) return null;
  const magic = new TextDecoder().decode(buf.subarray(cd - 16, cd));
  if (magic !== BLOCK_MAGIC) return null;
  const size = u64(cd - 24);
  const start = cd - size - 8;
  if (start < 0 || u64(start) !== size) return null;

  // ID-value pairs between the two size fields.
  const values = new Map();
  for (let at = start + 8; at < cd - 24; ) {
    const len = u64(at);
    if (len < 4 || at + 8 + len > cd - 24) throw new Error("bad pair");
    values.set(u32(at + 8), buf.subarray(at + 12, at + 8 + len));
    at += 8 + len;
  }

  for (const [id] of SCHEMES) {
    const value = values.get(id);
    if (!value) continue;
    const certs = [];
    for (const signer of lengthPrefixedItems(lengthPrefixed(value, 0))) {
      const signedData = lengthPrefixed(signer, 0);
      const digests = lengthPrefixed(signedData, 0);
      const certList = lengthPrefixed(signedData, 4 + digests.length);
      const first = lengthPrefixedItems(certList)[0];
      if (first) certs.push(first);
    }
    return certs;
  }
  return null;
}

function lengthPrefixed(bytes, at) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(at, true);
  if (at + 4 + len > bytes.length) throw new Error("bad length");
  return bytes.subarray(at + 4, at + 4 + len);
}

function lengthPrefixedItems(bytes) {
  const items = [];
  for (let at = 0; at < bytes.length; ) {
    const item = lengthPrefixed(bytes, at);
    items.push(item);
    at += 4 + item.length;
  }
  return items;
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
