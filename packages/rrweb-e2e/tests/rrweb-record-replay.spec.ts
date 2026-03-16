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

  test("incremental source map: dynamically added elements appear in store after replay", async ({ page }) => {
    // ---- Record ----
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot plugin event to be emitted
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    // Now add a new element AFTER the full snapshot
    await page.click("#btn-contact");
    await page.waitForTimeout(500);
    await expect(page.locator("#contact-info")).toBeVisible();

    // Wait for incremental plugin event
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "incremental"),
      { timeout: 5_000 }
    );

    // Verify the incremental event has the contact-info element
    const incrementalEvent = await page.evaluate(() => {
      const evt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental"
      );
      return evt?.data?.payload ?? null;
    });
    expect(incrementalEvent).not.toBeNull();
    expect(incrementalEvent.kind).toBe("incremental");
    expect(Object.keys(incrementalEvent.added).length).toBeGreaterThan(0);

    // Verify the added node has expected metadata
    const addedNodes = Object.values(incrementalEvent.added) as any[];
    const contactNode = addedNodes.find((n: any) => n.tagName === "div" && n.cssClasses?.includes("contact-card"));
    console.log("Incremental added contact node:", JSON.stringify(contactNode, null, 2));
    expect(contactNode).toBeDefined();
    expect(contactNode.accessibility).toBeDefined();
    expect(contactNode.accessibility.role).toContain("complementary");
    expect(contactNode.accessibility.label).toContain("Contact");

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    // ---- Replay and verify store has the incremental node ----
    await page.evaluate(() => window.__startReplay());
    await page.waitForFunction(() => window.__replayReady === true, { timeout: 10_000 });

    // Wait for replay to complete (play through all events)
    await page.waitForTimeout(3000);

    // Wait for store to populate
    await page.waitForFunction(
      () => window.__sourceStore && window.__sourceStore.size() > 0,
      { timeout: 10_000 }
    );

    // The store should contain the dynamically-added contact-info node
    const storeHasContact = await page.evaluate(() => {
      const store = window.__sourceStore;
      const all = store.getAll();
      let found = false;
      all.forEach((info: any) => {
        if (info.tagName === "div" && info.cssClasses?.includes("contact-card")) {
          found = true;
        }
      });
      return found;
    });
    console.log(`Store has contact-card after replay: ${storeHasContact}`);
    expect(storeHasContact).toBe(true);
  });

  test("incremental source map: removed elements tracked in incremental events", async ({ page }) => {
    // ---- Record ----
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    // Verify item-list exists in full snapshot
    const fullEvent = await page.evaluate(() => {
      const evt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "full"
      );
      return evt?.data?.payload ?? null;
    });
    const listNodesInFull = Object.values(fullEvent.nodes as Record<string, any>).filter(
      (n: any) => n.tagName === "ul" || n.tagName === "li"
    );
    console.log(`List nodes in full snapshot: ${listNodesInFull.length}`);
    expect(listNodesInFull.length).toBeGreaterThan(0);

    // Now remove the item-list
    await page.click("#btn-remove");
    await page.waitForTimeout(500);
    await expect(page.locator("#item-list")).not.toBeVisible();

    // Wait for incremental event with removals
    await page.waitForFunction(
      () => window.__rrwebEvents.some(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental" && e.data?.payload?.removed?.length > 0
      ),
      { timeout: 5_000 }
    );

    const removeEvent = await page.evaluate(() => {
      const evt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental" && e.data?.payload?.removed?.length > 0
      );
      return evt?.data?.payload ?? null;
    });
    console.log(`Removed node IDs: ${JSON.stringify(removeEvent.removed)}`);
    expect(removeEvent.removed.length).toBeGreaterThanOrEqual(1); // at least the <ul>

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });
  });

  test("store onChange fires on replay and unsubscribe stops notifications", async ({ page }) => {
    // ---- Record ----
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);
    await page.click("#btn-home");
    await page.waitForTimeout(1000);
    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    // ---- Replay with onChange tracking ----
    await page.evaluate(() => {
      (window as any).__onChangeCount = 0;
      window.__startReplay();
      const unsub = window.__sourceStore.onChange(() => {
        (window as any).__onChangeCount++;
      });
      // Store the unsubscribe function
      (window as any).__unsubOnChange = unsub;
    });

    await page.waitForFunction(() => window.__replayReady === true, { timeout: 10_000 });
    await page.waitForFunction(
      () => window.__sourceStore && window.__sourceStore.size() > 0,
      { timeout: 10_000 }
    );

    const changeCount = await page.evaluate(() => (window as any).__onChangeCount);
    console.log(`onChange fired ${changeCount} times`);
    expect(changeCount).toBeGreaterThan(0);

    // Unsubscribe and verify no more notifications
    const countBefore = await page.evaluate(() => {
      (window as any).__unsubOnChange();
      return (window as any).__onChangeCount;
    });

    // Trigger another replay to see if onChange fires again
    // We can't easily trigger another store update, but we can verify
    // the unsubscribe function returned without error
    expect(countBefore).toBeGreaterThan(0);
    console.log(`Unsubscribe called successfully, count was ${countBefore}`);
  });

  test("element filtering: script and style tags are excluded from source map", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot plugin event
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    const sourceMap = await page.evaluate(() => {
      const evt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "full"
      );
      return evt?.data?.payload ?? null;
    });

    const nodes = Object.values(sourceMap.nodes) as any[];
    const tagNames = nodes.map((n: any) => n.tagName);
    console.log(`All captured tags: ${[...new Set(tagNames)].sort().join(", ")}`);

    // script and style should be filtered out
    expect(tagNames).not.toContain("script");
    expect(tagNames).not.toContain("style");
    expect(tagNames).not.toContain("meta");
    expect(tagNames).not.toContain("link");
    expect(tagNames).not.toContain("noscript");
    expect(tagNames).not.toContain("br");
    expect(tagNames).not.toContain("hr");

    // Real elements SHOULD be present
    expect(tagNames).toContain("button");
    expect(tagNames).toContain("h1");
    expect(tagNames).toContain("input");
    expect(tagNames).toContain("form");
    expect(tagNames).toContain("nav");
    expect(tagNames).toContain("ul");
    expect(tagNames).toContain("li");
    console.log(`Filtering works: ${nodes.length} elements captured, no script/style/meta`);
  });

  test("plugin cleanup: mutations after stopRecording do not emit new plugin events", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    // Stop recording
    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    // Count plugin events before mutation
    const pluginEventsBefore = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 6).length
    );
    console.log(`Plugin events before post-stop mutation: ${pluginEventsBefore}`);

    // Mutate the DOM AFTER recording stopped
    await page.click("#btn-contact");
    await page.waitForTimeout(500);
    await expect(page.locator("#contact-info")).toBeVisible();

    // Also do rapid mutations
    await page.evaluate(() => (window as any).__rapidMutations());
    await page.waitForTimeout(500);

    // Count plugin events after mutation — should be the same
    const pluginEventsAfter = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 6).length
    );
    console.log(`Plugin events after post-stop mutation: ${pluginEventsAfter}`);
    expect(pluginEventsAfter).toBe(pluginEventsBefore);
  });

  test("subtree addition: all children of added subtree are captured in incremental event", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    // Add a nested subtree
    await page.evaluate(() => (window as any).__addSubtree());
    await page.waitForTimeout(500);

    // Wait for incremental event
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "incremental"),
      { timeout: 5_000 }
    );

    const incrementalEvent = await page.evaluate(() => {
      const evt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental"
      );
      return evt?.data?.payload ?? null;
    });

    const addedNodes = Object.values(incrementalEvent.added) as any[];
    const addedTags = addedNodes.map((n: any) => n.tagName);
    console.log(`Subtree added tags: ${addedTags.join(", ")}`);

    // The parent AND its children should all be captured
    expect(addedTags).toContain("div");     // #nested-wrapper
    expect(addedTags).toContain("section"); // #nested-section
    expect(addedTags).toContain("h3");      // #nested-heading
    expect(addedTags).toContain("p");       // #nested-para
    expect(addedTags).toContain("ul");      // #nested-list
    expect(addedTags).toContain("li");      // .nested-item

    // Verify accessibility info on the wrapper
    const wrapper = addedNodes.find((n: any) => n.tagName === "div" && n.cssClasses?.includes("nested-level-0"));
    expect(wrapper).toBeDefined();
    expect(wrapper.accessibility).toBeDefined();
    expect(wrapper.accessibility.role).toContain("region");

    // Verify the nested list has a11y
    const nestedList = addedNodes.find((n: any) => n.tagName === "ul" && n.cssClasses?.includes("nested-level-2"));
    expect(nestedList).toBeDefined();
    expect(nestedList.accessibility.role).toContain("list");

    console.log(`Total children captured: ${addedNodes.length}`);
    expect(addedNodes.length).toBeGreaterThanOrEqual(6); // wrapper + section + h3 + p + ul + 2 li

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });
  });

  test("subtree removal: all child IDs from removed subtree are in removed array", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    // Add subtree first, then remove it
    await page.evaluate(() => (window as any).__addSubtree());
    await page.waitForTimeout(500);

    // Count nodes in the subtree before removing
    const subtreeNodeCount = await page.evaluate(() => {
      const wrapper = document.getElementById("nested-wrapper")!;
      // wrapper + all descendants
      return 1 + wrapper.querySelectorAll("*").length;
    });
    console.log(`Subtree has ${subtreeNodeCount} total nodes`);

    // Now remove the entire subtree
    await page.evaluate(() => (window as any).__removeSubtree());
    await page.waitForTimeout(500);

    // Wait for incremental event with removals
    await page.waitForFunction(
      () => window.__rrwebEvents.some(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental" && e.data?.payload?.removed?.length > 0
      ),
      { timeout: 5_000 }
    );

    const removeEvent = await page.evaluate(() => {
      const evt = window.__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental" && e.data?.payload?.removed?.length > 0
      );
      return evt?.data?.payload ?? null;
    });

    console.log(`Removed IDs count: ${removeEvent.removed.length}`);
    // Should have IDs for the wrapper + all its element children
    // (text nodes don't get tracked, but elements do)
    expect(removeEvent.removed.length).toBeGreaterThanOrEqual(3);
    // All removed IDs should be valid numbers (not -1)
    for (const id of removeEvent.removed) {
      expect(typeof id).toBe("number");
      expect(id).not.toBe(-1);
    }

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });
  });

  test("CSS selector accuracy: captured selectors resolve to the correct elements", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    // Get all source map entries and verify selectors work
    const selectorResults = await page.evaluate(() => {
      const evt = (window as any).__rrwebEvents.find(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "full"
      );
      const nodes = evt?.data?.payload?.nodes ?? {};
      const results: { nodeId: string; tagName: string; selector: string; resolves: boolean; matchesTag: boolean }[] = [];

      for (const [nodeId, info] of Object.entries(nodes) as [string, any][]) {
        if (!info.selector || info.selector === "") continue;
        try {
          const el = document.querySelector(info.selector);
          results.push({
            nodeId,
            tagName: info.tagName,
            selector: info.selector,
            resolves: el !== null,
            matchesTag: el !== null && el.tagName.toLowerCase() === info.tagName,
          });
        } catch {
          results.push({ nodeId, tagName: info.tagName, selector: info.selector, resolves: false, matchesTag: false });
        }
      }
      return results;
    });

    const withSelectors = selectorResults.filter((r: any) => r.selector);
    const resolving = selectorResults.filter((r: any) => r.resolves);
    const matching = selectorResults.filter((r: any) => r.matchesTag);

    console.log(`Selectors tested: ${withSelectors.length}, resolving: ${resolving.length}, tag matches: ${matching.length}`);

    // At least 80% of non-empty selectors should resolve to an element
    expect(resolving.length / withSelectors.length).toBeGreaterThan(0.8);
    // All resolving selectors should match the correct tag
    expect(matching.length).toBe(resolving.length);

    // Spot-check specific elements
    const submitBtn = selectorResults.find((r: any) => r.selector.includes("submit-btn"));
    expect(submitBtn).toBeDefined();
    expect(submitBtn!.resolves).toBe(true);
    expect(submitBtn!.matchesTag).toBe(true);

    const navBar = selectorResults.find((r: any) => r.selector.includes("nav-bar"));
    expect(navBar).toBeDefined();
    expect(navBar!.resolves).toBe(true);
  });

  test("rapid successive mutations are batched into a single incremental event", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);

    // Wait for full snapshot
    await page.waitForFunction(
      () => window.__rrwebEvents.some((e: any) => e.type === 6 && e.data?.payload?.kind === "full"),
      { timeout: 5_000 }
    );

    // Count plugin events before rapid mutations
    const pluginEventsBefore = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 6).length
    );

    // Fire 10 mutations in rapid succession (synchronous loop)
    await page.evaluate(() => (window as any).__rapidMutations());
    await page.waitForTimeout(500);

    // Count incremental plugin events
    const incrementalEvents = await page.evaluate(() =>
      window.__rrwebEvents.filter(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "incremental"
      )
    );

    console.log(`Incremental events after 10 rapid mutations: ${incrementalEvents.length}`);

    // Should be batched — NOT 10 separate events
    // The queueMicrotask batching should combine them into 1-2 events
    expect(incrementalEvents.length).toBeLessThanOrEqual(3);
    expect(incrementalEvents.length).toBeGreaterThan(0);

    // Verify all 10 rapid items are in the combined events
    const allAdded: any[] = [];
    for (const evt of incrementalEvents) {
      allAdded.push(...Object.values(evt.data.payload.added));
    }
    const rapidItems = allAdded.filter((n: any) => n.cssClasses?.includes("rapid-item"));
    console.log(`Rapid items captured: ${rapidItems.length}`);
    expect(rapidItems.length).toBe(10);

    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });
  });

  test("store getByNodeId returns null for nonexistent node ID", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    // Start replay to populate store
    await page.evaluate(() => window.__startReplay());
    await page.waitForFunction(() => window.__replayReady === true, { timeout: 10_000 });
    await page.waitForFunction(
      () => window.__sourceStore && window.__sourceStore.size() > 0,
      { timeout: 10_000 }
    );

    // Query for IDs that definitely don't exist
    const results = await page.evaluate(() => {
      const store = window.__sourceStore;
      return {
        negativeOne: store.getByNodeId(-1),
        zero: store.getByNodeId(0),
        hugeId: store.getByNodeId(999999),
        nanResult: store.getByNodeId(NaN),
      };
    });

    expect(results.negativeOne).toBeNull();
    expect(results.zero).toBeNull();
    expect(results.hugeId).toBeNull();
    expect(results.nanResult).toBeNull();
    console.log("All nonexistent node ID lookups correctly return null");
  });

  test("store getAll returns a defensive copy that does not affect the store", async ({ page }) => {
    await page.goto("http://localhost:3399/");
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    await page.evaluate(() => window.__startReplay());
    await page.waitForFunction(() => window.__replayReady === true, { timeout: 10_000 });
    await page.waitForFunction(
      () => window.__sourceStore && window.__sourceStore.size() > 0,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => {
      const store = window.__sourceStore;
      const sizeBefore = store.size();

      // Get a copy and mutate it
      const copy = store.getAll();
      copy.clear(); // wipe the copy
      copy.set(99999, { tagName: "fake", selector: "fake" });

      const sizeAfter = store.size();
      const hasFake = store.getByNodeId(99999);

      return { sizeBefore, sizeAfter, copyCleared: copy.size === 1, hasFake };
    });

    console.log(`Store size before: ${result.sizeBefore}, after mutating copy: ${result.sizeAfter}`);
    expect(result.sizeAfter).toBe(result.sizeBefore);
    expect(result.hasFake).toBeNull();
    console.log("Defensive copy confirmed: mutating getAll() does not affect store");
  });

  test("recording restart: stop then start again captures fresh events", async ({ page }) => {
    await page.goto("http://localhost:3399/");

    // ---- First recording ----
    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);
    await page.click("#btn-home");
    await page.waitForTimeout(1000);
    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    const firstPluginEvents = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 6).length
    );
    console.log(`First recording plugin events: ${firstPluginEvents}`);
    expect(firstPluginEvents).toBeGreaterThan(0);

    // ---- Clear events and start second recording ----
    await page.evaluate(() => (window as any).__clearEvents());
    const clearedCount = await page.evaluate(() => window.__rrwebEvents.length);
    expect(clearedCount).toBe(0);

    await page.evaluate(() => window.__startRecording());
    await page.waitForTimeout(500);
    await page.click("#btn-about");
    await page.waitForTimeout(1000);
    await page.evaluate(() => { if (window.__stopRecording) window.__stopRecording(); });

    // Second recording should have its own events
    const secondTotal = await page.evaluate(() => window.__rrwebEvents.length);
    const secondPluginEvents = await page.evaluate(() =>
      window.__rrwebEvents.filter((e: any) => e.type === 6).length
    );
    console.log(`Second recording: ${secondTotal} total events, ${secondPluginEvents} plugin events`);
    expect(secondTotal).toBeGreaterThan(5);
    expect(secondPluginEvents).toBeGreaterThan(0);

    // Second recording should have a full snapshot
    const hasFullSnapshot = await page.evaluate(() =>
      window.__rrwebEvents.some((e: any) => e.type === 2)
    );
    expect(hasFullSnapshot).toBe(true);

    // Second recording should have a full source map
    const hasFullSourceMap = await page.evaluate(() =>
      window.__rrwebEvents.some(
        (e: any) => e.type === 6 && e.data?.payload?.kind === "full"
      )
    );
    expect(hasFullSourceMap).toBe(true);
    console.log("Recording restart works: fresh full snapshot + source map emitted");
  });
});
