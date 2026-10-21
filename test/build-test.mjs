// Builds dist-test/: the real page with the USB layer and app list swapped for
// test doubles, so the UI can be driven without a phone.
import * as esbuild from "esbuild";
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const swaps = {
  "./adb.js": resolve("test/mock-adb.js"),
  "./apps.js": resolve("test/mock-apps.js"),
};

await rm("dist-test", { recursive: true, force: true });
await cp("public", "dist-test", { recursive: true });
await esbuild.build({
  entryPoints: { app: "src/main.js" },
  bundle: true,
  format: "esm",
  outdir: "dist-test",
  logLevel: "warning",
  plugins: [
    {
      name: "swap",
      setup(build) {
        build.onResolve({ filter: /^\.\/(adb|apps)\.js$/ }, (args) =>
          args.importer.endsWith("main.js") ? { path: swaps[args.path] } : undefined,
        );
      },
    },
  ],
});
