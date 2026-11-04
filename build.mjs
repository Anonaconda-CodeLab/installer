// Builds the static site into dist/.
//   node build.mjs           production build
//   node build.mjs --serve   build, then serve dist/ on http://localhost:8000 and rebuild on change

import * as esbuild from "esbuild";
import { watch } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const serve = process.argv.includes("--serve");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp("public", outdir, { recursive: true });
await writeFile(join(outdir, "THIRD_PARTY_NOTICES.txt"), await thirdPartyNotices());

const options = {
  entryPoints: { app: "src/main.js" },
  bundle: true,
  format: "esm",
  target: ["chrome109"],
  minify: !serve,
  sourcemap: serve ? "inline" : false,
  legalComments: "none",
  outdir,
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // esbuild only watches the script's inputs; copy public/ again whenever a page file changes.
  watch("public", { recursive: true }, () => cp("public", outdir, { recursive: true }).catch(console.error));
  const { port } = await ctx.serve({ servedir: outdir, port: 8000 });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await esbuild.build(options);
}

// Collects the licence texts of every bundled package (Tango and its parts).
async function thirdPartyNotices() {
  const scope = "node_modules/@yume-chan";
  const names = (await readdir(scope)).sort();
  const parts = [
    "This site bundles the following third-party software.",
    "",
    "Atkinson Hyperlegible font: Copyright Braille Institute of America, Inc.,",
    "licensed under the SIL Open Font License 1.1 (see fonts/OFL.txt).",
    "",
  ];
  for (const name of names) {
    const pkg = JSON.parse(await readFile(join(scope, name, "package.json"), "utf8"));
    const licence = await readFile(join(scope, name, "LICENSE"), "utf8");
    parts.push("=".repeat(72), `${pkg.name} ${pkg.version} (${pkg.license})`, pkg.homepage ?? "", "", licence.trim(), "");
  }
  return parts.join("\n");
}
