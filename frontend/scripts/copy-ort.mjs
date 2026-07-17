/**
 * Copy onnxruntime-web's wasm runtime into public/ort/ so the browser CV path
 * loads binaries from our own origin (no CDN → works offline, no CSP/CORS issues,
 * and the bytes are cached by Vercel's edge). Runs on predev/prebuild.
 *
 * We ship the wasm-EP binaries only (single-threaded, no jsep/jspi) — that matches
 * lib/cv-browser.ts (executionProviders: ["wasm"], numThreads: 1) and avoids the
 * COOP/COEP cross-origin-isolation headers that threaded wasm would require.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", "node_modules", "onnxruntime-web");
const src = join(pkgRoot, "dist");

// Copy into a version-scoped directory so the wasm URL is content-addressed. sw.js caches
// /ort/* cache-first forever and next.config.mjs marks it immutable for a year — under a
// fixed path, an ORT upgrade would be invisible to returning users, silently keeping them
// on the old runtime. cv-version.mjs derives this same version from this same package.json.
const ortVersion = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf-8")).version;
const ortRoot = join(here, "..", "public", "ort");
const dst = join(ortRoot, ortVersion);

// public/ort/ is gitignored and rebuilt every install, so old versions are pure litter.
rmSync(ortRoot, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });

// We load ORT at runtime with a native (webpackIgnore) dynamic import straight from
// our own origin, so the bundler never touches it (Next's Terser chokes on ORT's
// import.meta.url wasm-glue). Ship:
//   - ort.wasm.bundle.min.mjs      the self-contained wasm-EP entry we import
//   - ort-wasm-simd-threaded.wasm  the actual WebAssembly binary (fetched via wasmPaths)
//   - ort-wasm-simd-threaded.mjs   glue (harmless fallback)
const wanted = (name) =>
  name === "ort.wasm.bundle.min.mjs" ||
  (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(name) &&
    !name.includes(".jsep.") &&
    !name.includes(".jspi.") &&
    !name.includes(".asyncify."));

let copied = 0;
for (const name of readdirSync(src)) {
  if (wanted(name)) {
    cpSync(join(src, name), join(dst, name));
    copied++;
  }
}

console.log(`[copy-ort] copied ${copied} runtime file(s) → public/ort/${ortVersion}/`);
if (copied === 0) {
  // Fail the build. Warning-and-continuing ships an app whose scanner 404s on the wasm
  // and falls back to "CV unavailable" — a silent loss of the product's headline feature.
  console.error("[copy-ort] no ORT runtime files found — is onnxruntime-web installed?");
  process.exit(1);
}
