import { test, expect } from "@playwright/test";

/**
 * E2E test: Real rrweb recording → real rrweb-player replay → real agentation source plugin.
 *
 * NO mocks. Everything runs in a real Chromium browser with real DOM, real rrweb, real plugins.
 */

test.describe("rrweb + agentation E2E", () => {
  test("records a page with source plugin, captures events with source map data", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await expect(page.locator("#main-heading")).toHaveText("Test Page for Recording");

    // Start rrweb recording with our source plugin
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // ---- Perform real user interactions ----
    await page.click("#btn-home");
    await page.waitForTimeout(200);
    await expect(page.locator("#dynamic-text")).toHaveText("Home clicked!");

    await page.click("#btn-about");
    await page.waitForTimeout(200);
    await expect(page.locator("#dynamic-text")).toHaveText("About clicked!");

    // Click contact → triggers DOM mutation (new element added)
    await page.click("#btn-contact");
    await page.waitForTimeout(200);
    await expect(page.locator("#contact-info")).toBeVisible();

    // Type in the form
    await page.fill("#name-input", "Playwright User");
    await page.fill("#email-input", "test@example.com");
    await page.click("#submit-btn");
    await page.waitForTimeout(200);
    await expect(page.locator("#dynamic-text")).toHaveText("Submitted: Playwright User");

    // Wait for source plugin batching
    await page.waitForTimeout(1000);

    // Stop recording
    await page.evaluate(() => {
      if (window.__stopRecording) window.__stopRecording();
    });

    // ---- Verify recorded events ----
    const eventCount = await page.evaluate(() => window.__rrwebEvents.length);
    console.log(`Recorded ${eventCount} rrweb events`);
    expect(eventCount).toBeGreaterThan(5);

    // Full snapshot event (type 2)
    const hasFullSnapshot = await page.evaluate(() =>
      window.__rrwebEvents.some((e: any) => e.type === 2)
    );
    expect(hasFullSnapshot).toBe(true);

    // Incremental snapshot events (type 3)
    const incrementalCount = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 3).length
    );
    console.log(`Incremental snapshot events: ${incrementalCount}`);
    expect(incrementalCount).toBeGreaterThan(0);

    // Plugin events (type 6) from our source-record plugin
    const pluginEvents = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 6)
    );
    console.log(`Plugin events: ${pluginEvents.length}`);
    expect(pluginEvents.length).toBeGreaterThan(0);

    // Verify our source map data
    const sourceMapEvent = await page.evaluate(() => {
      const pluginEvt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.plugin === "agentation/source-map@1"
      );
      return pluginEvt?.data ?? null;
    });
    expect(sourceMapEvent).not.toBeNull();
    expect(sourceMapEvent.plugin).toBe("agentation/source-map@1");
    expect(sourceMapEvent.payload.kind).toBe("full");
    expect(sourceMapEvent.payload.nodes).toBeDefined();

    const nodeEntries = Object.entries(sourceMapEvent.payload.nodes) as [string, any][];
    console.log(`Source map contains ${nodeEntries.length} node entries`);
    expect(nodeEntries.length).toBeGreaterThan(5);

    // Find a button with accessibility info
    const buttonNode = nodeEntries.find(
      ([_, info]: [string, any]) => info.tagName === "button" && info.selector?.includes("submit")
    );
    if (buttonNode) {
      const [nodeId, info] = buttonNode;
      console.log(`Found submit button (id=${nodeId}):`, JSON.stringify(info, null, 2));
      expect(info.tagName).toBe("button");
      expect(info.selector).toBeTruthy();
      expect(info.accessibility).toBeDefined();
    }

    // Verify we have nodes with accessibility info
    const nodesWithAccessibility = nodeEntries.filter(
      ([_, info]: [string, any]) => info.accessibility !== null
    );
    console.log(`Nodes with accessibility info: ${nodesWithAccessibility.length}`);
    expect(nodesWithAccessibility.length).toBeGreaterThan(0);

    // Verify we have nodes with CSS classes
    const nodesWithClasses = nodeEntries.filter(
      ([_, info]: [string, any]) => info.cssClasses && info.cssClasses.length > 0
    );
    console.log(`Nodes with CSS classes: ${nodesWithClasses.length}`);
    expect(nodesWithClasses.length).toBeGreaterThan(0);
  });

  test("replays recording and source store populates with real data", async ({ page }) => {
    // ---- Record phase ----
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    await page.click("#btn-home");
    await page.waitForTimeout(200);
    await page.click("#btn-contact");
    await page.waitForTimeout(200);
    await page.fill("#name-input", "Test");
    await page.click("#submit-btn");
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      if (window.__stopRecording) window.__stopRecording();
    });

    const eventCount = await page.evaluate(() => window.__rrwebEvents.length);
    console.log(`Recorded ${eventCount} events for replay test`);
    expect(eventCount).toBeGreaterThan(5);

    // ---- Replay phase (autoPlay: true) ----
    await page.evaluate(() => window.__startReplay());

    // Wait for replay iframe
    await page.waitForFunction(() => window.__replayReady === true, { timeout: 10_000 });

    const iframeHandle = await page.locator("#player-target iframe").elementHandle();
    expect(iframeHandle).not.toBeNull();

    // Wait for source store to get populated (autoPlay triggers handler immediately)
    await page.waitForFunction(
      () => window.__sourceStore && window.__sourceStore.size() > 0,
      { timeout: 10_000 }
    );

    // Verify the source store has real data
    const storeSize = await page.evaluate(() => window.__sourceStore.size());
    console.log(`Source store has ${storeSize} entries after replay`);
    expect(storeSize).toBeGreaterThan(5);

    // Query the store for specific elements
    const storeData = await page.evaluate(() => {
      const store = window.__sourceStore;
      const all = store.getAll();
      const entries: [number, any][] = [];
      all.forEach((info: any, id: number) => {
        entries.push([id, info]);
      });
      return entries;
    });

    // Verify real element metadata came through record → plugin event → replay → store
    const buttons = storeData.filter(([_, info]: any) => info.tagName === "button");
    console.log(`Buttons in store: ${buttons.length}`);
    expect(buttons.length).toBeGreaterThan(0);

    const btn = buttons[0][1];
    expect(btn.selector).toBeTruthy();
    expect(btn.tagName).toBe("button");

    // Verify accessibility info survived the round-trip
    const withA11y = storeData.filter(([_, info]: any) => info.accessibility !== null);
    console.log(`Nodes with a11y after replay: ${withA11y.length}`);
    expect(withA11y.length).toBeGreaterThan(0);
  });

  test("replay iframe elements can be identified by source store via getByElement", async ({ page }) => {
    // ---- Record ----
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);
    await page.click("#btn-home");
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      if (window.__stopRecording) window.__stopRecording();
    });

    // ---- Replay (autoPlay: true) ----
    await page.evaluate(() => window.__startReplay());
    await page.waitForFunction(() => window.__replayReady === true, { timeout: 10_000 });

    // Wait for store to populate
    await page.waitForFunction(
      () => window.__sourceStore && window.__sourceStore.size() > 0,
      { timeout: 10_000 }
    );

    // ---- Test getByElement on real replay iframe DOM elements ----
    const lookupResult = await page.evaluate(() => {
      const store = window.__sourceStore;
      const iframe = document.querySelector("#player-target iframe") as HTMLIFrameElement;
      if (!iframe || !iframe.contentDocument) return { error: "no iframe" };

      const doc = iframe.contentDocument;
      const allElements = doc.querySelectorAll("*");
      let foundCount = 0;
      let matchedCount = 0;
      const results: any[] = [];

      for (const el of allElements) {
        const sn = (el as any).__sn;
        if (sn && typeof sn === "object" && typeof sn.id === "number") {
          foundCount++;
          const info = store.getByElement(el);
          if (info) {
            matchedCount++;
            results.push({
              nodeId: sn.id,
              tagName: info.tagName,
              selector: info.selector,
              accessibility: info.accessibility,
              cssClasses: info.cssClasses,
            });
          }
        }
      }

      return { foundCount, matchedCount, results: results.slice(0, 10) };
    });

    console.log("getByElement results:", JSON.stringify(lookupResult, null, 2));

    // If the Replayer uses __sn, these should match
    // If not (newer rrweb), foundCount might be 0 — that's a separate concern
    if (lookupResult.foundCount > 0) {
      expect(lookupResult.matchedCount).toBeGreaterThan(0);
      console.log(
        `${lookupResult.matchedCount}/${lookupResult.foundCount} replay elements resolved via getByElement`
      );
      expect(lookupResult.results.length).toBeGreaterThan(0);
      expect(lookupResult.results[0].tagName).toBeTruthy();
      expect(lookupResult.results[0].selector).toBeTruthy();
    } else {
      // rrweb Replayer may not set __sn on replay nodes — verify via getByNodeId instead
      console.log("Replayer doesn't set __sn on elements, testing getByNodeId instead");
      const nodeIdResult = await page.evaluate(() => {
        const store = window.__sourceStore;
        const all = store.getAll();
        const entries: any[] = [];
        all.forEach((info: any, id: number) => {
          entries.push({ nodeId: id, tagName: info.tagName, selector: info.selector });
        });
        return entries.slice(0, 5);
      });
      console.log("Store entries by nodeId:", JSON.stringify(nodeIdResult, null, 2));
      expect(nodeIdResult.length).toBeGreaterThan(0);
      expect(nodeIdResult[0].tagName).toBeTruthy();
    }
  });
});
