import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";

// PDF import is entirely client-side (pdfjs → canvas → JPEG data URLs → Dexie),
// so this spec runs signed OUT: nothing touches Supabase, and the only network
// dependency — the pdf.js worker pinned to a CDN — is intercepted and served
// from node_modules so the test runs offline.

const PAGE_COUNT = 60;
const FIXTURE = resolve(import.meta.dirname, ".artifacts", "large.pdf");
const require = createRequire(import.meta.url);

test.beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= PAGE_COUNT; i++) {
    const page = doc.addPage([612, 792]);
    page.drawRectangle({
      x: 40,
      y: 40,
      width: 532,
      height: 712,
      color: rgb((i % 10) / 10, 0.4, 0.8),
    });
    page.drawText(`Page ${i} of ${PAGE_COUNT}`, { x: 60, y: 720, size: 24, color: rgb(1, 1, 1) });
  }
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, await doc.save());
});

test("a large PDF imports as one slide per page without freezing or blowing up storage", async ({
  page,
}) => {
  test.setTimeout(300_000);

  // Serve the CDN-pinned pdf.js worker from the local install (same version).
  const workerBody = readFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"));
  await page.route("**/pdf.worker.min.mjs", (route) =>
    route.fulfill({ body: workerBody, contentType: "text/javascript" }),
  );

  await page.goto("/");
  const before = await page.evaluate(() => navigator.storage.estimate());

  // Signed-out empty device → first-time landing; "New Set" is a dropdown.
  // Retry the click until the menu opens: a click that lands before React
  // hydrates (slow first compile under `vite dev`) is silently lost.
  await expect(async () => {
    await page.getByRole("button", { name: "New Set" }).click();
    await expect(page.getByRole("menuitem", { name: "New Media" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("menuitem", { name: "New Media" }).click();
  await expect(page).toHaveURL(/\/set\//);

  // The drop zone (and its file input) mounts only once the editor's set has
  // loaded from Dexie — files set on the pre-load input instance are lost.
  await expect(page.getByText(/Drop images/)).toBeVisible();
  await page.locator('label:has-text("Drop images") input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByText("Converting…")).toBeVisible();

  // When conversion finishes, the editor lists one image slide per PDF page.
  await expect(page.getByText("Converting…")).toBeHidden({ timeout: 240_000 });
  await expect(page.getByText(`Slides (${PAGE_COUNT})`)).toBeVisible();

  // Storage canary: scale-2.0 JPEG data-URLs are heavy by design; catch them
  // getting catastrophically heavier. Logged for trend-watching.
  const after = await page.evaluate(() => navigator.storage.estimate());
  const usedMb = ((after.usage ?? 0) - (before.usage ?? 0)) / 1024 / 1024;
  console.log(`[pdf-import] ${PAGE_COUNT} pages -> ~${usedMb.toFixed(1)} MB of storage`);
  expect(after.usage ?? 0).toBeGreaterThan(before.usage ?? 0);
  expect(usedMb).toBeLessThan(300);
});
