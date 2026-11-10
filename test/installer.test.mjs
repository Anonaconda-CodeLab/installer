// Fast checks that run in CI with plain Node (no browser): the official app list, the signing-certificate reader,
// and the security headers. The page itself is tested in test/ui_test.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { OFFICIAL_APPS, STUDIO_CERT_SHA256, downloadUrl, findOfficialBuild, isStudioSigned } from "../src/apps.js";
import { signingCertSha256s, formatFingerprint } from "../src/apk.js";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("every official app has a well-formed latest release", () => {
  assert.equal(OFFICIAL_APPS.length, 6);
  const ids = new Set();
  for (const app of OFFICIAL_APPS) {
    assert.ok(!ids.has(app.id), `${app.id} listed once`);
    ids.add(app.id);
    assert.ok(app.name && app.blurb, `${app.id} has a name and blurb`);
    assert.match(app.repo, /^[a-z0-9-]+$/, `${app.id} repo`);
    assert.match(app.installPage, /^https:\/\/[a-z]+\.anonacondacodelab\.com\/android\.html$/, `${app.id} install page`);
    const { version, file, sha256: sum } = app.release;
    assert.match(version, /^\d+\.\d+\.\d+$/, `${app.id} version`);
    assert.match(sum, /^[0-9a-f]{64}$/, `${app.id} SHA-256 is 64 lowercase hex characters`);
    assert.ok(file.endsWith(`-${version}.apk`), `${app.id} file name carries its version`);
    assert.equal(
      downloadUrl(app),
      `https://github.com/Anonaconda-CodeLab/${app.repo}/releases/download/v${version}/${file}`,
    );
  }
});

test("the studio certificate is the published one", () => {
  assert.equal(
    formatFingerprint(STUDIO_CERT_SHA256),
    "4D:6C:EA:58:94:C0:D7:D8:E9:AB:74:BC:3A:1E:9C:A5:47:BD:40:A2:02:B6:70:99:AF:66:5B:29:7F:7A:8F:47",
  );
});

test("official only with the listed checksum and the studio certificate", () => {
  const rounds = OFFICIAL_APPS.find((a) => a.id === "rounds");
  assert.equal(findOfficialBuild(rounds.release.sha256.toUpperCase())?.app.id, "rounds");
  assert.equal(findOfficialBuild("0".repeat(64)), null);
  assert.equal(isStudioSigned([STUDIO_CERT_SHA256]), true);
  assert.equal(isStudioSigned([STUDIO_CERT_SHA256, "1".repeat(64)]), false, "every signer must be ours");
  assert.equal(isStudioSigned([]), false);
  assert.equal(isStudioSigned(null), false);
});

// A minimal "APK": an APK Signing Block followed by an empty central directory and its end record. The reader only
// looks at this structure, so the certificate can be any bytes.
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const lp = (bytes) => Buffer.concat([u32(bytes.length), bytes]);

function fakeApk(schemeId, certs) {
  const signers = certs.map((cert) => {
    const signedData = Buffer.concat([lp(lp(Buffer.from("digest"))), lp(lp(cert)), lp(Buffer.alloc(0))]);
    return lp(Buffer.concat([lp(signedData), lp(Buffer.from("sig")), lp(Buffer.from("key"))]));
  });
  const value = lp(Buffer.concat(signers));
  const pairs = Buffer.concat([u64(value.length + 4), u32(schemeId), value]);
  const size = pairs.length + 24;
  const block = Buffer.concat([u64(size), pairs, u64(size), Buffer.from("APK Sig Block 42")]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt32LE(block.length, 16); // central directory starts right after the block
  return Buffer.concat([block, eocd]);
}

test("reads the signer certificate from v2, v3 and v3.1 blocks", async () => {
  const cert = Buffer.from("a certificate");
  for (const id of [0x7109871a, 0xf05368c0, 0x1b93ad61]) {
    assert.deepEqual(await signingCertSha256s(fakeApk(id, [cert])), [sha256(cert)]);
  }
  const two = await signingCertSha256s(fakeApk(0x7109871a, [cert, Buffer.from("another")]));
  assert.equal(two.length, 2, "every signer is reported");
});

test("gives null, never an exception, for unsigned, truncated or garbage files", async () => {
  const good = fakeApk(0x7109871a, [Buffer.from("cert")]);
  assert.equal(await signingCertSha256s(Buffer.from("PK\x03\x04 not really a zip")), null);
  assert.equal(await signingCertSha256s(Buffer.alloc(0)), null);
  assert.equal(await signingCertSha256s(good.subarray(10)), null, "cut-off start");
  const lying = Buffer.from(good);
  lying.writeUInt32LE(0xffffff, 8 + 8 + 4); // a length far past the end of the block
  assert.equal(await signingCertSha256s(lying), null, "length past the end");
  assert.equal(await signingCertSha256s(fakeApk(0x12345678, [Buffer.from("cert")])), null, "unknown scheme only");
});

test("security headers and page policy stay strict", () => {
  const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const csp of [headers, page]) {
    for (const rule of ["default-src 'self'", "script-src 'self'", "connect-src 'none'", "object-src 'none'",
      "base-uri 'none'", "require-trusted-types-for 'script'", "trusted-types 'none'"]) {
      assert.ok(csp.includes(rule), rule);
    }
    assert.ok(!csp.includes("unsafe-inline") && !csp.includes("unsafe-eval"));
  }
  for (const h of ["frame-ancestors 'none'", "X-Frame-Options: DENY", "Strict-Transport-Security",
    "Cross-Origin-Opener-Policy: same-origin", "usb=(self)", "https://:project.pages.dev/*", "X-Robots-Tag: noindex"]) {
    assert.ok(headers.includes(h), h);
  }
});

test("the page doesn't encourage “Always allow”", () => {
  const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.ok(page.includes("There's no need to tick “Always allow from this computer”"));
  assert.ok(!/tick “Always allow from this computer” to skip/.test(page));
});

test("forgetting the key fails, not succeeds, when another tab blocks it", async () => {
  const { forgetKey } = await import("../src/adb.js");
  const fakeDb = (event) => ({
    deleteDatabase() {
      const request = {};
      setTimeout(() => request[event]?.());
      return request;
    },
  });
  globalThis.indexedDB = fakeDb("onblocked");
  await assert.rejects(forgetKey(), { name: "KeyInUseError" });
  globalThis.indexedDB = fakeDb("onsuccess");
  await forgetKey();
  delete globalThis.indexedDB;
});
