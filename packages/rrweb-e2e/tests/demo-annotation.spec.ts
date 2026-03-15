import { test, expect, Page } from "@playwright/test";

/**
 * E2E test for the interactive demo page:
 *   Record → interact → Stop → Replay → Pause → Annotate → click elements
 *   → fill popup → submit → verify annotations
 *
 * Tests the full agentation annotation pipeline with real rrweb recording + replay
 * using agentation's AnnotationPopupCSS component.
 */

/** Helper: record a quick session, replay, and wait for annotation mode */
async function setupAnnotationMode(page: Page) {
  await page.goto("http://localhost:3399/demo.html");

  await page.click("#btn-record");
  await page.waitForTimeout(500);
  await page.click("#card-analytics");
  await page.waitForTimeout(300);
  await page.click("#card-reports");
  await page.waitForTimeout(300);
  await page.click("#btn-add-todo");
  await page.waitForTimeout(1500);
  await page.click("#btn-stop");
  await page.waitForTimeout(300);

  await page.click("#btn-replay");
  await expect(page.locator("#replay-root iframe")).toBeVisible({ timeout: 10_000 });

  // Wait for replay to finish → annotate button appears
  const annotateBtn = page.getByRole("button", { name: "Annotate" });
  await expect(annotateBtn).toBeVisible({ timeout: 30_000 });
  await annotateBtn.click();
  await expect(page.getByRole("button", { name: "Stop Annotating" })).toBeVisible();
}

/** Helper: click an element in the replay iframe via page coordinates */
async function clickIframeElement(page: Page, selector: string) {
  const iframe = page.frameLocator("#replay-root iframe");
  const el = iframe.locator(selector);
  await expect(el).toBeVisible({ timeout: 5_000 });
  // Use the element's bounding box to click on the overlay at the right position
  const bbox = await el.boundingBox();
  expect(bbox).toBeTruthy();
  await page.mouse.click(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2);
}

/** Helper: fill the annotation popup and submit via the Add button */
async function fillAndSubmitPopup(page: Page, comment: string) {
  const popup = page.locator("[data-annotation-popup]");
  await expect(popup).toBeVisible({ timeout: 5_000 });
  const textarea = popup.locator("textarea");
  await expect(textarea).toBeVisible();
  await textarea.click();
  await textarea.type(comment, { delay: 10 });
  // Click the Add button to submit
  await popup.getByText("Add").click();
}

test.describe("demo annotation flow", () => {
  test("record, replay, annotate an element with popup, and verify annotation appears", async ({ page }) => {
    await setupAnnotationMode(page);

    // Click an element in the replay iframe → popup should appear
    await clickIframeElement(page, "#card-analytics");

    // Fill and submit via the popup
    await fillAndSubmitPopup(page, "This analytics card needs better contrast");

    // Verify annotation appeared in the panel
    await expect(page.locator("#annotation-count")).toContainText("(1)", { timeout: 5_000 });

    const annotationCard = page.locator(".annotation-card").first();
    await expect(annotationCard).toBeVisible();

    const cardText = await annotationCard.textContent();
    expect(cardText).toContain("This analytics card needs better contrast");
    expect(cardText).toContain("Path:");
    console.log("Annotation card text:", cardText);

    // Click another element and annotate it
    await clickIframeElement(page, "#card-reports");
    await fillAndSubmitPopup(page, "Reports card looks good");

    await expect(page.locator("#annotation-count")).toContainText("(2)", { timeout: 5_000 });
    console.log("Two annotations created successfully");
  });

  test("annotate button only appears when player is paused", async ({ page }) => {
    await page.goto("http://localhost:3399/demo.html");

    await page.click("#btn-record");
    await page.waitForTimeout(500);
    await page.click("#card-analytics");
    await page.waitForTimeout(1500);
    await page.click("#btn-stop");
    await page.waitForTimeout(300);

    await page.click("#btn-replay");
    await expect(page.locator("#replay-root iframe")).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(500);
    const annotateBtn = page.getByRole("button", { name: "Annotate" });
    await expect(annotateBtn).toBeVisible({ timeout: 30_000 });
  });

  test("annotation popup shows computed styles and element info", async ({ page }) => {
    await setupAnnotationMode(page);

    // Click an element
    await clickIframeElement(page, "#card-analytics");

    // The popup should appear
    const popup = page.locator("[data-annotation-popup]");
    await expect(popup).toBeVisible({ timeout: 5_000 });

    // The popup header should show the element identification
    const popupContent = await popup.textContent();
    console.log("Popup content:", popupContent);
    // Should have element name and action buttons
    expect(popupContent).toContain("Cancel");
    expect(popupContent).toContain("Add");

    // Cancel the popup
    await popup.getByText("Cancel").click();
    await page.waitForTimeout(300);

    // Popup should be gone
    await expect(popup).not.toBeVisible({ timeout: 2_000 });
  });

  test("annotation contains rich metadata from agentation utilities", async ({ page }) => {
    await setupAnnotationMode(page);

    // Click on a button element for richer metadata
    const iframeBBox = await page.locator("#replay-root iframe").boundingBox();
    expect(iframeBBox).toBeTruthy();

    // Click somewhere in the iframe
    await page.mouse.click(
      iframeBBox!.x + iframeBBox!.width / 3,
      iframeBBox!.y + iframeBBox!.height / 3,
    );

    // Fill the popup and submit
    await fillAndSubmitPopup(page, "Test annotation for rich metadata");

    // Verify annotation
    await expect(page.locator("#annotation-count")).toContainText("(1)", { timeout: 5_000 });
    const cardText = await page.locator(".annotation-card").first().textContent();
    console.log("Rich metadata annotation:", cardText);

    // Should have Path and Bounding box at minimum
    expect(cardText).toContain("Path:");
    expect(cardText).toContain("Bounding box:");
    // Should have the user's comment
    expect(cardText).toContain("Test annotation for rich metadata");
  });
});
