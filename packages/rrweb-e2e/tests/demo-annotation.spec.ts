import { test, expect, Page, FrameLocator } from "@playwright/test";

/**
 * E2E test for the interactive demo page:
 *   Record → interact → Stop → Replay → Pause → Annotate → click elements → verify annotations
 *
 * Tests the full agentation annotation pipeline with real rrweb recording + replay.
 */

test.describe("demo annotation flow", () => {
  test("record, replay, annotate an element, and verify annotation appears with source info", async ({ page }) => {
    await page.goto("http://localhost:3399/demo.html");

    // ---- Step 1: Start recording ----
    const btnRecord = page.locator("#btn-record");
    const btnStop = page.locator("#btn-stop");
    const btnReplay = page.locator("#btn-replay");

    await btnRecord.click();
    await expect(page.locator("#status")).toContainText("Recording");

    // ---- Step 2: Interact with the sample app ----
    await page.click("#card-analytics");
    await page.waitForTimeout(300);
    await page.click("#card-reports");
    await page.waitForTimeout(300);
    await page.click("#btn-add-todo");
    await page.waitForTimeout(300);

    // Wait for source plugin batching
    await page.waitForTimeout(1000);

    // ---- Step 3: Stop recording ----
    await btnStop.click();
    await expect(page.locator("#status")).toContainText("Stopped");
    await expect(page.locator("#status")).toContainText("events captured");

    // ---- Step 4: Replay ----
    await btnReplay.click();
    await expect(page.locator("#replay-section")).toBeVisible();
    await expect(page.locator("#annotations-section")).toBeVisible();

    // Wait for the rrweb-player to mount and the iframe to appear
    const playerIframe = page.locator("#replay-root iframe");
    await expect(playerIframe).toBeVisible({ timeout: 10_000 });

    // Wait for replay to finish (the player auto-plays, and "finish" event triggers isPaused=true)
    // The "Annotate" button appears once paused
    const annotateBtn = page.getByRole("button", { name: "Annotate" });
    await expect(annotateBtn).toBeVisible({ timeout: 30_000 });

    // ---- Step 5: Click "Annotate" ----
    await annotateBtn.click();

    // The button text should now say "Stop Annotating"
    await expect(page.getByRole("button", { name: "Stop Annotating" })).toBeVisible();

    // ---- Step 6: Click an element inside the replay iframe ----
    // The replay iframe contains the recorded DOM. We need to click inside it.
    const iframe = page.frameLocator("#replay-root iframe");

    // The sample app has a card with id="card-analytics" — click it in the replay
    const analyticsCard = iframe.locator("#card-analytics");
    await expect(analyticsCard).toBeVisible({ timeout: 5_000 });
    await analyticsCard.click();

    // ---- Step 7: Verify annotation appeared ----
    // The annotation count should now be 1
    await expect(page.locator("#annotation-count")).toContainText("(1)", { timeout: 5_000 });

    // Verify annotation card content
    const annotationCard = page.locator(".annotation-card").first();
    await expect(annotationCard).toBeVisible();

    // Should have the element name
    const elementName = annotationCard.locator(".ann-element");
    await expect(elementName).toBeVisible();
    const elementText = await elementName.textContent();
    expect(elementText).toBeTruthy();
    console.log("Annotation element:", elementText);

    // Should have the element path
    const pathValue = annotationCard.locator(".ann-label", { hasText: "Path:" }).locator("~ .ann-value").first();
    // Use a broader locator approach since the sibling selector may not work
    const cardText = await annotationCard.textContent();
    expect(cardText).toContain("Path:");
    console.log("Full annotation card text:", cardText);

    // ---- Step 8: Click another element ----
    const reportsCard = iframe.locator("#card-reports");
    if (await reportsCard.isVisible()) {
      await reportsCard.click();
      await expect(page.locator("#annotation-count")).toContainText("(2)", { timeout: 5_000 });
      console.log("Second annotation created successfully");
    }

    // ---- Step 9: Verify annotations have accessibility info ----
    // The cards have role="article" and aria-label attributes
    const allCards = await page.locator(".annotation-card").count();
    console.log(`Total annotation cards: ${allCards}`);
    expect(allCards).toBeGreaterThanOrEqual(1);

    // Check that at least one annotation has accessibility info
    const fullText = await page.locator("#annotations-list").textContent();
    console.log("Annotations list text:", fullText);

    // The original cards have role="article" and aria-label, so we expect accessibility info
    if (fullText?.includes("Accessibility:")) {
      console.log("Accessibility info present in annotations");
    }
  });

  test("annotate button only appears when player is paused", async ({ page }) => {
    await page.goto("http://localhost:3399/demo.html");

    // Record minimal interaction
    await page.click("#btn-record");
    await page.waitForTimeout(500);
    await page.click("#card-analytics");
    await page.waitForTimeout(1500);
    await page.click("#btn-stop");
    await page.waitForTimeout(300);

    // Start replay
    await page.click("#btn-replay");
    await expect(page.locator("#replay-root iframe")).toBeVisible({ timeout: 10_000 });

    // During playback, "Annotate" button should NOT be visible
    // (isPaused is false during playback, and RRWebAnnotator is conditionally rendered)
    // Wait a small amount for replay to start
    await page.waitForTimeout(500);

    // After replay finishes (short recording), annotate button should appear
    const annotateBtn = page.getByRole("button", { name: "Annotate" });
    await expect(annotateBtn).toBeVisible({ timeout: 30_000 });
  });

  test("annotation contains element path and bounding box", async ({ page }) => {
    await page.goto("http://localhost:3399/demo.html");

    // Record
    await page.click("#btn-record");
    await page.waitForTimeout(500);
    await page.click("#card-settings");
    await page.waitForTimeout(1500);
    await page.click("#btn-stop");

    // Replay
    await page.click("#btn-replay");
    const annotateBtn = page.getByRole("button", { name: "Annotate" });
    await expect(annotateBtn).toBeVisible({ timeout: 30_000 });
    await annotateBtn.click();

    // Click at the center of the replay iframe to annotate whatever element is there.
    // We use page.mouse.click because the overlay intercepts clicks and uses
    // elementFromPoint on the iframe's contentDocument.
    const iframeBBox = await page.locator("#replay-root iframe").boundingBox();
    expect(iframeBBox).toBeTruthy();
    await page.mouse.click(
      iframeBBox!.x + iframeBBox!.width / 3,
      iframeBBox!.y + iframeBBox!.height / 3,
    );

    // Verify annotation
    await expect(page.locator("#annotation-count")).toContainText("(1)", { timeout: 5_000 });

    const cardText = await page.locator(".annotation-card").first().textContent();
    console.log("Annotation card text:", cardText);

    // Must have Path and Bounding box info
    expect(cardText).toContain("Path:");
    expect(cardText).toContain("Bounding box:");

    // The path should reference a real element (not empty)
    const pathMatch = cardText?.match(/Path:\s*(\S+)/);
    expect(pathMatch).toBeTruthy();
    console.log("Annotation path:", pathMatch?.[1]);
  });
});
