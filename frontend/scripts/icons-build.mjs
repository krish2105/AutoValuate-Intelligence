/* Usage: node scripts/icons-build.mjs  (from frontend/). Masters live in public/icons/*.svg. */
/* Regenerate every raster icon from the SVG masters, so the PNGs can never drift from them. */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const jobs = [
  ["public/icons/icon.svg",          512, "public/icons/icon-512.png"],
  ["public/icons/icon.svg",          192, "public/icons/icon-192.png"],
  ["public/icons/icon.svg",          180, "public/icons/apple-touch-icon.png"],
  ["public/icons/icon.svg",          256, "app/icon.png"],
  ["public/icons/icon-maskable.svg", 512, "public/icons/maskable-512.png"],
];
const b = await chromium.launch();
for (const [src, size, out] of jobs) {
  const svg = readFileSync(src, "utf8");
  writeFileSync("/tmp/_ib.html", `<body style="margin:0"><div style="width:${size}px;height:${size}px">${svg}</div></body>`);
  const p = await (await b.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })).newPage();
  await p.goto("file:///tmp/_ib.html");
  await p.waitForTimeout(250);
  await p.screenshot({ path: out, omitBackground: true });
  await p.close();
  console.log(`${out}  ${size}x${size}`);
}
await b.close();
