import { test, expect, type Page, type Request } from "@playwright/test";
import { PNG_1x1_RED, PNG_2x1_BLUE, CORRUPT_IMAGE, makeFiles } from "./_cv-fixtures";

/**
 * Regression tests for the on-device damage scan.
 *
 * Each test here corresponds to a defect confirmed in the pre-fix code:
 *
 *  1. `photos` (base64 data URLs) were POSTed to /valuate/stream on every valuation, while
 *     the UI, manifest, pricing page and README all promised "photos never leave your
 *     device". `toApiVehicle` stripped only `asking_price_aed` and forwarded the rest.
 *  2. Submit was gated on `!valid || loading` only — it knew nothing about the scan, so a
 *     mid-scan submit sent the PREVIOUS photo set's condition with the new photos.
 *  3. Changing photos never invalidated the old condition (`onCondition` was only reset
 *     when the set became empty).
 *  4. A condition carried no binding to the photos or model that produced it.
 *
 * The backend is stubbed, so these assert what the CLIENT sends — which is exactly the
 * claim under test. The real detector runs; nothing about the model is mocked.
 */

const API_GLOB = "**autovaluate-api.onrender.com/**";

/** Everything the app POSTed to the valuation API during a test. */
function captureValuationPosts(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /autovaluate-api|\/valuate|\/estimate/.test(r.url())) seen.push(r);
  });
  return seen;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("av_onboarded_v1", "1"));
});

async function fillCar(page: Page) {
  // By role, not placeholder — the plain-English description field's placeholder also
  // contains "Toyota", so getByPlaceholder is ambiguous.
  await page.getByRole("textbox", { name: "Make" }).fill("Toyota");
  await page.getByRole("textbox", { name: "Model" }).fill("Corolla");
}

test("photos never appear in the valuation payload", async ({ page }) => {
  // Stub the API so the request is observable and the run completes deterministically.
  await page.route(API_GLOB, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  const posts = captureValuationPosts(page);

  await page.goto("/");
  await fillCar(page);
  await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED, PNG_2x1_BLUE]));

  // Wait for the scan to reach a terminal state — submit is blocked until then (test 2).
  const submit = page.getByRole("button", { name: /value my car/i });
  await expect(submit).toBeEnabled({ timeout: 120_000 });
  await submit.click();

  await expect.poll(() => posts.length, { timeout: 30_000 }).toBeGreaterThan(0);

  for (const req of posts) {
    const body = req.postData() ?? "";
    // The strongest form of the claim: no photo bytes in any shape.
    expect(body, "payload must not contain a data: URL").not.toContain("data:image");
    expect(body, "payload must not contain base64 PNG bytes").not.toContain("iVBORw0KGgo");
    expect(body, "payload must not contain a blob/object URL").not.toContain("blob:");

    const json = JSON.parse(body);
    expect(json, "payload must have no photos field").not.toHaveProperty("photos");
    // ...but it must still tell the backend how many there were, and which set.
    expect(json.photo_count).toBe(2);
    expect(typeof json.photo_set_hash).toBe("string");
    expect(json.photo_set_hash.length).toBeGreaterThan(16);
  }
});

test("the condition sent is bound to the photo set and model that produced it", async ({ page }) => {
  await page.route(API_GLOB, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  const posts = captureValuationPosts(page);

  await page.goto("/");
  await fillCar(page);
  await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED]));

  const submit = page.getByRole("button", { name: /value my car/i });
  await expect(submit).toBeEnabled({ timeout: 120_000 });
  await submit.click();
  await expect.poll(() => posts.length, { timeout: 30_000 }).toBeGreaterThan(0);

  const json = JSON.parse(posts[0].postData() ?? "{}");
  const cc = json.client_condition;
  // A 1x1 red pixel yields no detections, but a COMPLETE scan of it is still a real
  // result and must be sent with full provenance — that is the point of the binding.
  expect(cc, "a completed scan must produce a condition").toBeTruthy();
  expect(cc.photo_set_hash).toBe(json.photo_set_hash);
  expect(cc.status).toBe("complete");
  expect(cc.source).toBe("browser");
  // Must be the real model's identity, not a placeholder.
  expect(cc.model_version).toMatch(/^[0-9a-f]{12}$/);
  expect(cc.preprocessing_version).toBeTruthy();
});

test("submit is blocked while a scan for the current photos is in flight", async ({ page }) => {
  await page.route(API_GLOB, (route) => route.abort());
  await page.goto("/");
  await fillCar(page);

  const submit = page.getByRole("button", { name: /value my car/i });
  // With no photos there is nothing to wait for.
  await expect(submit).toBeEnabled();

  await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED, PNG_2x1_BLUE]));

  // The instant photos exist, the button must lock until the scan settles. This is the
  // window in which the old code would submit the previous set's condition.
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/waiting — the on-device scan is still running/i)).toBeVisible();

  await expect(submit).toBeEnabled({ timeout: 120_000 });
});

test("changing photos invalidates the previous scan result immediately", async ({ page }) => {
  await page.route(API_GLOB, (route) => route.abort());
  await page.goto("/");
  await fillCar(page);

  await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED]));
  const submit = page.getByRole("button", { name: /value my car/i });
  await expect(submit).toBeEnabled({ timeout: 120_000 });
  // A completed scan of one photo.
  await expect(page.getByText(/on-device damage scan/i)).toBeVisible();

  // Adding a photo must re-lock submit. Previously the old condition stayed live and
  // submittable throughout the rescan.
  await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED, PNG_2x1_BLUE]));
  await expect(submit).toBeDisabled();
  await expect(submit).toBeEnabled({ timeout: 120_000 });
});

test("an unreadable photo blocks submit until explicitly accepted, and is never scored as clean", async ({ page }) => {
  await page.route(API_GLOB, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  const posts = captureValuationPosts(page);

  await page.goto("/");
  await fillCar(page);
  // One good photo, one that cannot be decoded.
  await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED, CORRUPT_IMAGE]));

  const submit = page.getByRole("button", { name: /value my car/i });
  // The old code pushed [] for a failed image and counted it in photos_assessed, so a
  // broken photo silently became "no damage found here".
  await expect(page.getByText(/1 of 2 photos could not be scanned/i)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/partial scan/i)).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/waiting — some photos could not be scanned/i)).toBeVisible();

  // Only an explicit, visible choice unblocks it.
  await page.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => posts.length, { timeout: 30_000 }).toBeGreaterThan(0);

  const cc = JSON.parse(posts[0].postData() ?? "{}").client_condition;
  expect(cc.status, "an incomplete scan must declare itself partial").toBe("partial");
  expect(cc.photos_assessed, "only the readable photo was assessed").toBe(1);
  expect(cc.needs_inspection, "a partial scan can never imply a clean car").toBe(true);
});

test("re-selecting the same file repeatedly is stable", async ({ page }) => {
  await page.route(API_GLOB, (route) => route.abort());
  await page.goto("/");
  await fillCar(page);

  const submit = page.getByRole("button", { name: /value my car/i });
  // Same bytes, three separate selections: each is a distinct photo in the set, and the
  // set must still settle rather than wedge on duplicate identities.
  for (let i = 0; i < 3; i++) {
    await page.setInputFiles('input[type="file"]', makeFiles([PNG_1x1_RED]));
    await expect(submit).toBeEnabled({ timeout: 120_000 });
  }
});
