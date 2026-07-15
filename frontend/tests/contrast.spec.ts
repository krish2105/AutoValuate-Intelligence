import { test, expect } from "@playwright/test";

/**
 * WCAG AA contrast gate over the semantic tokens (master plan WS F1: "AA contrast in
 * both themes locked"). Reads the LIVE computed custom properties in each theme, so it
 * verifies what actually renders, not what the stylesheet intends.
 *
 * Standard text pairs must clear 4.5:1 (AA normal text). The accent CTA pair is held to
 * 3.0:1 (AA large-text / UI-component bound — the only accent-on-accent text is the
 * uppercase semibold CTA) with the measured value reported either way.
 */

const hslToLum = (h: number, s: number, l: number): number => {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
};

const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const TEXT_PAIRS: Array<[string, string]> = [
  ["--fg", "--bg"], ["--fg", "--surface"], ["--fg", "--surface-2"],
  ["--muted", "--bg"], ["--muted", "--surface"], ["--muted", "--surface-2"],
];

for (const theme of ["dark", "light"] as const) {
  test(`semantic tokens meet WCAG AA in ${theme} mode`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((t) => {
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(t);
    }, theme);

    const tokens = await page.evaluate((names) => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()]));
    }, [...new Set([...TEXT_PAIRS.flat(), "--accent", "--accent-fg"])]);

    const lum = (name: string) => {
      const m = tokens[name].match(/([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
      expect(m, `token ${name} should be an H S% L% triplet, got "${tokens[name]}"`).toBeTruthy();
      return hslToLum(parseFloat(m![1]), parseFloat(m![2]), parseFloat(m![3]));
    };

    for (const [fg, bg] of TEXT_PAIRS) {
      const r = ratio(lum(fg), lum(bg));
      expect(r, `${theme}: ${fg} on ${bg} = ${r.toFixed(2)}:1 (AA needs 4.5:1)`).toBeGreaterThanOrEqual(4.5);
    }

    const cta = ratio(lum("--accent-fg"), lum("--accent"));
    console.log(`${theme}: --accent-fg on --accent = ${cta.toFixed(2)}:1`);
    expect(cta, `${theme}: CTA pair = ${cta.toFixed(2)}:1 (large-text/UI bound is 3.0:1)`).toBeGreaterThanOrEqual(3.0);
  });
}
