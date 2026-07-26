import { test, expect } from "@playwright/test";
import { composeMessage, whatsappUrl, pickTarget } from "../lib/share-targets";

/**
 * Pure unit tests for the share targets — no page, no navigator (same pattern as
 * deal-score / financing / capture-quality).
 *
 * The encoding cases are the ones that actually bite: a UAE listing is full of newlines,
 * "AED", "+", "&" and Arabic-adjacent punctuation, and a single unescaped character silently
 * truncates the message the user sends to a buyer.
 */

test("the URL is appended after the text, separated from it", () => {
  const m = composeMessage({ text: "2019 Nissan Patrol — AED 92,244", url: "https://x.co/r/abc123" });
  expect(m).toBe("2019 Nissan Patrol — AED 92,244\n\nhttps://x.co/r/abc123");
});

test("no URL means no trailing whitespace", () => {
  expect(composeMessage({ text: "hello" })).toBe("hello");
});

test("over-long text is cut and visibly marked, never silently truncated", () => {
  const long = "x".repeat(5000);
  const m = composeMessage({ text: long });
  expect(m.length).toBeLessThan(long.length);
  expect(m.endsWith("…")).toBe(true);
});

test("a realistic listing body survives intact", () => {
  // ~600 chars is a normal listing; it must NOT be truncated.
  const body = "2019 Nissan Patrol, 120,000 km. ".repeat(18);
  expect(composeMessage({ text: body }).endsWith("…")).toBe(false);
});

test("characters that break naive URL building are escaped", () => {
  const u = whatsappUrl({ text: "AED 92,244 & 50% off\nline two +971 #1 ?x=y" });
  // Raw specials would end the query string or start a new param.
  expect(u).not.toContain("\n");
  expect(u.split("?text=")[1]).not.toContain("&");
  expect(u.split("?text=")[1]).not.toContain("#");
  // And they round-trip back to exactly what we meant to send.
  expect(decodeURIComponent(u.split("?text=")[1]))
    .toBe("AED 92,244 & 50% off\nline two +971 #1 ?x=y");
});

test("the em dash and AED figures round-trip (UAE copy is full of both)", () => {
  const text = "Asking AED 95,000 — fair value is AED 92,244";
  expect(decodeURIComponent(whatsappUrl({ text }).split("?text=")[1])).toBe(text);
});

test("it is a wa.me deep link with no recipient pinned", () => {
  const u = whatsappUrl({ text: "hi" });
  expect(u.startsWith("https://wa.me/?text=")).toBe(true);
});

test("target routing: native sheet on mobile, wa.me everywhere else", () => {
  expect(pickTarget(true)).toBe("web-share");
  expect(pickTarget(false)).toBe("whatsapp");
});
