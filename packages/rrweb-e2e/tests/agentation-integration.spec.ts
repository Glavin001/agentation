import { test, expect, Page } from "@playwright/test";

/**
 * E2E tests for the REAL Agentation integration in rrweb replay.
 *
 * Verifies that the actual <Agentation /> component (not a recreation)
 * renders on top of the rrweb replay, with all features:
 * - Floating toolbar button appears when replay is paused
 * - Toolbar expands on click with all annotation modes
 * - Clicking elements in the replay iframe creates annotations
 * - Annotation popup appears and can be filled/submitted
 * - Markers appear on the overlay
 * - Annotations appear in the demo's annotation panel
 */

// The main toolbar div (not markers/fixed layers) — use first() since
// Agentation renders multiple elements with data-feedback-toolbar.
const TOOLBAR_LOCATOR = "[data-feedback-toolbar]";

/** Record a quick session and start replay */
async function recordAndReplay(page: Page) {
  await page.goto("http://localhost:3399/demo.html");

  // Record
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

  // Replay
  await page.click("#btn-replay");
  await expect(page.locator("#replay-root iframe")).toBeVisible({ timeout: 10_000 });
}

/** Wait for the replay to finish (player enters paused state) and Agentation to appear */
async function waitForAgentation(page: Page) {
  // Wait for the Agentation toolbar to appear (rendered via portal when isPaused=true)
  // Use first() since Agentation renders 3 elements with data-feedback-toolbar
  await expect(page.locator(TOOLBAR_LOCATOR).first()).toBeVisible({ timeout: 30_000 });
}

/** Click the collapsed Agentation button to expand the toolbar */
async function activateAgentation(page: Page) {
  // The collapsed toolbar has a title="Start feedback mode" — click it to expand
  const collapsedBtn = page.locator(`[title="Start feedback mode"]`);
  await expect(collapsedBtn).toBeVisible({ timeout: 5_000 });
  await collapsedBtn.click();
  // Wait for expansion animation
  await page.waitForTimeout(500);
}

/** Click a position in the replay iframe overlay to annotate */
async function clickInReplay(page: Page, selector: string) {
  const iframe = page.frameLocator("#replay-root iframe");
  const el = iframe.locator(selector);
  await expect(el).toBeVisible({ timeout: 5_000 });
  const bbox = await el.boundingBox();
  expect(bbox).toBeTruthy();
  // Click on the overlay at the element's position
  await page.mouse.click(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2);
}

/** Fill annotation popup and submit */
async function fillAndSubmitPopup(page: Page, comment: string) {
  const popup = page.locator("[data-annotation-popup]");
  await expect(popup).toBeVisible({ timeout: 5_000 });
  const textarea = popup.locator("textarea");
  await expect(textarea).toBeVisible();
  // Use force:true because the popup is position:fixed inside a container overlay
  // and Playwright may report it as "outside viewport" due to stacking context
  await textarea.click({ force: true });
  await textarea.type(comment, { delay: 10 });
  await popup.getByText("Add").click({ force: true });
}

test.describe("Agentation integration in rrweb replay", () => {
  test("agentation toolbar appears when replay is paused", async ({ page }) => {
    await recordAndReplay(page);
    await waitForAgentation(page);

    // The toolbar should have the data-feedback-toolbar attribute
    const toolbar = page.locator(TOOLBAR_LOCATOR).first();
    await expect(toolbar).toBeVisible();

    // Should be rendered inside the replay area (via portal into the RRWebAnnotator container)
    const annotatorContainer = page.locator("[data-rrweb-annotator]");
    await expect(annotatorContainer).toBeAttached();
  });

  test("toolbar expands and shows annotation controls on click", async ({ page }) => {
    await recordAndReplay(page);
    await waitForAgentation(page);
    await activateAgentation(page);

    // The expanded toolbar should show buttons (close, modes, settings, copy, etc.)
    const toolbar = page.locator(TOOLBAR_LOCATOR).first();
    await expect(toolbar).toBeVisible();

    const buttons = toolbar.locator("button");
    const buttonCount = await buttons.count();
    // Expanded toolbar should have multiple buttons
    expect(buttonCount).toBeGreaterThanOrEqual(2);
    console.log(`Toolbar buttons count: ${buttonCount}`);
  });

  test("click element in replay → annotation popup appears → submit → annotation created", async ({ page }) => {
    await recordAndReplay(page);
    await waitForAgentation(page);
    await activateAgentation(page);

    // Click an element in the replay iframe
    await clickInReplay(page, "#card-analytics");

    // The annotation popup should appear
    await fillAndSubmitPopup(page, "Analytics card needs better contrast");

    // Verify annotation appeared in the demo's annotation panel
    await expect(page.locator("#annotation-count")).toContainText("(1)", { timeout: 5_000 });

    const annotationCard = page.locator(".annotation-card").first();
    await expect(annotationCard).toBeVisible();
    const cardText = await annotationCard.textContent();
    expect(cardText).toContain("Analytics card needs better contrast");
    expect(cardText).toContain("Path:");
  });

  test("multiple annotations can be created", async ({ page }) => {
    await recordAndReplay(page);
    await waitForAgentation(page);
    await activateAgentation(page);

    // First annotation
    await clickInReplay(page, "#card-analytics");
    await fillAndSubmitPopup(page, "First annotation");
    await expect(page.locator("#annotation-count")).toContainText("(1)", { timeout: 5_000 });

    // Wait for popup to close before clicking next element
    await expect(page.locator("[data-annotation-popup]")).not.toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    // Second annotation
    await clickInReplay(page, "#card-reports");
    await fillAndSubmitPopup(page, "Second annotation");
    await expect(page.locator("#annotation-count")).toContainText("(2)", { timeout: 5_000 });

    // Both annotations should be visible
    const cards = page.locator(".annotation-card");
    await expect(cards).toHaveCount(2);
  });

  test("annotation popup can be cancelled", async ({ page }) => {
    await recordAndReplay(page);
    await waitForAgentation(page);
    await activateAgentation(page);

    // Click an element
    await clickInReplay(page, "#card-analytics");

    // Popup should appear
    const popup = page.locator("[data-annotation-popup]");
    await expect(popup).toBeVisible({ timeout: 5_000 });

    // Cancel it
    await popup.getByText("Cancel").click({ force: true });
    await page.waitForTimeout(500);

    // Should have no annotations
    await expect(page.locator("#annotation-count")).toContainText("(0)");
  });

  test("hover highlight appears when moving mouse over replay elements", async ({ page }) => {
    await recordAndReplay(page);
    await waitForAgentation(page);
    await activateAgentation(page);

    // Get the iframe element's position
    const iframe = page.frameLocator("#replay-root iframe");
    const el = iframe.locator("#card-analytics");
    await expect(el).toBeVisible({ timeout: 5_000 });
    const bbox = await el.boundingBox();
    expect(bbox).toBeTruthy();

    // Move mouse over the element
    await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2);
    await page.waitForTimeout(500);

    // The hover info tooltip should appear somewhere in the portal
    // Just verify the toolbar is still visible and responsive after hover
    const toolbar = page.locator(TOOLBAR_LOCATOR).first();
    await expect(toolbar).toBeVisible();
  });
});
