import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MUSCLES } from "../../src/lib/exercise-muscle-taxonomy";
import { getAnatomicalRegionsForSurface } from "../../src/components/pt/anatomical-muscle-selector/anatomy-registry";
import { openAnatomyFixture } from "./utils/anatomy-fixture";

const atlasName = "Find your target muscle";
const visibleSelector = (page: Page) =>
  page.locator(".anatomy-selector:visible");
const artifactRoot =
  "tmp/exercise-catalog/anatomy-supplied-assets/screenshots/after";

async function expectAnatomyFramed(scope: Locator) {
  const frame = await scope.locator(".anatomy-canvas").boundingBox();
  const artwork = await scope.locator(".anatomy-content-layer").boundingBox();
  expect(frame).not.toBeNull();
  expect(artwork).not.toBeNull();
  const figure = scope.locator("svg.anatomy-figure");
  const surface = await figure.getAttribute("data-surface");
  const image = figure.locator(".anatomy-base-layer image");
  await expect(image).toHaveAttribute(
    "href",
    `/assets/anatomy/male-${surface}.png`,
  );
  expect(
    await image.evaluate(async (element) => {
      const asset = new Image();
      asset.src = element.getAttribute("href")!;
      await asset.decode();
      return [asset.naturalWidth, asset.naturalHeight];
    }),
  ).toEqual([1024, 1536]);
  expect(artwork!.x).toBeGreaterThanOrEqual(frame!.x);
  expect(artwork!.y).toBeGreaterThanOrEqual(frame!.y);
  expect(artwork!.x + artwork!.width).toBeLessThanOrEqual(
    frame!.x + frame!.width,
  );
  expect(artwork!.y + artwork!.height).toBeLessThanOrEqual(
    frame!.y + frame!.height,
  );
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const selector of await page
    .locator(".anatomy-selector:visible")
    .all()) {
    expect(
      await selector.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  const atlas = page.getByRole("dialog", { name: atlasName });
  if (await atlas.count()) {
    expect(
      await atlas.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
}

// Find a point that is actually inside this hit shape, rather than clicking a
// bilateral group's bounding-box center (which can fall between the muscles).
async function clickHitShape(page: Page, shape: Locator, regionId: string) {
  await shape.scrollIntoViewIfNeeded();
  const point = await shape.evaluate((element, id) => {
    const box = element.getBoundingClientRect();
    for (let y = 0.1; y < 1; y += 0.1)
      for (let x = 0.1; x < 1; x += 0.1) {
        const px = box.left + box.width * x;
        const py = box.top + box.height * y;
        if (
          document
            .elementFromPoint(px, py)
            ?.closest("[data-hit-region]")
            ?.getAttribute("data-hit-region") === id
        )
          return { x: px, y: py };
      }
    return null;
  }, regionId);
  expect(point, `${regionId} has a reachable pointer target`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

test("controlled selection, every bilateral region, keyboard and disabled activation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openAnatomyFixture(page, "isolated");
  const selector = visibleSelector(page);
  await page.getByLabel("Reflect callbacks").uncheck();
  await selector
    .getByRole("button", { name: "Pectorals", exact: true })
    .press("Enter");
  await expect(page.getByTestId("selection-events")).toHaveText(
    '["pectorals"]',
  );
  await expect(
    selector.getByRole("button", { name: "Pectorals", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Reflect callbacks").check();
  for (const surface of ["front", "back"] as const) {
    await selector
      .getByRole("button", {
        name: surface === "front" ? "Front" : "Back",
        exact: true,
      })
      .click();
    for (const definition of getAnatomicalRegionsForSurface(surface)) {
      const hit = selector.locator(`[data-hit-region="${definition.id}"]`);
      for (const key of ["Enter", "Space"]) {
        await hit.press(key);
        await expect(page.getByTestId("muscle-value")).toHaveText(
          definition.muscleKey,
        );
        await expect(hit).toHaveAttribute("aria-pressed", "true");
      }
      for (const side of ["left", "right"] as const) {
        const index = definition.hitAreas.findIndex(
          (shape) => shape.side === side,
        );
        if (index < 0) continue;
        await selector
          .getByRole("button", { name: "Clear selected muscle" })
          .click();
        await clickHitShape(
          page,
          hit.locator(".anatomy-hit-area").nth(index),
          definition.id,
        );
        await expect(page.getByTestId("muscle-value")).toHaveText(
          definition.muscleKey,
        );
      }
    }
  }
  await page.getByRole("button", { name: "Parent selects pectorals" }).click();
  await expect(selector.locator(".anatomy-selection-context")).toContainText(
    "Pectorals",
  );
  await expect(selector.locator(".anatomy-selection-context")).toContainText(
    "Selected on front",
  );
  await selector.getByRole("button", { name: "Front", exact: true }).click();
  await page.getByLabel("Disable selector").check();
  const before = await page.getByTestId("selection-events").textContent();
  await selector
    .locator('[data-hit-region="front-biceps"]')
    .dispatchEvent("click");
  await selector
    .locator('[data-hit-region="front-biceps"]')
    .dispatchEvent("keydown", { key: "Enter" });
  await expect(page.getByTestId("selection-events")).toHaveText(before!);
  await expect(
    selector.getByRole("button", { name: "Clear selected muscle" }),
  ).toBeDisabled();
  await expect(
    selector.getByRole("button", { name: "Expand anatomy" }),
  ).toBeDisabled();
  await expect(
    selector.locator('[data-hit-region="front-chest"]'),
  ).toHaveAttribute("aria-pressed", "true");
});

test("list reaches every muscle; atlas is immediate, scoped, and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await openAnatomyFixture(page, "isolated");
  const selector = visibleSelector(page);
  await selector.getByRole("tab", { name: "Muscle list" }).click();
  for (const muscle of MUSCLES) {
    await selector
      .getByRole("searchbox", { name: "Search muscles" })
      .fill(muscle.label);
    await selector
      .getByRole("button", {
        name: new RegExp(`^${muscle.label}( Selected)?$`),
      })
      .click();
    await expect(page.getByTestId("muscle-value")).toHaveText(muscle.key);
  }
  await selector.getByRole("tab", { name: "Body map" }).click();
  const trigger = selector.getByRole("button", { name: "Expand anatomy" });
  await trigger.click();
  const atlas = page.getByRole("dialog", { name: atlasName });
  await expect(atlas).toBeVisible();
  const resources = await page
    .locator("svg defs [id]")
    .evaluateAll((elements) => elements.map((e) => e.id));
  expect(resources.length).toBeGreaterThan(0);
  expect(new Set(resources).size).toBe(resources.length);
  expect(await page.locator("html").getAttribute("class")).toBe("light");
  expect(
    await atlas.evaluate((e) =>
      getComputedStyle(e).getPropertyValue("--ui-surface").trim(),
    ),
  ).toBe("#0b1720");
  await atlas.getByRole("searchbox", { name: "Search muscles" }).fill("chest");
  await atlas
    .locator(".anatomy-atlas-navigation")
    .getByRole("button", { name: "Pectorals", exact: true })
    .click();
  await expect(page.getByTestId("muscle-value")).toHaveText("pectorals");
  await expect(
    atlas.locator('[data-hit-region="front-chest"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(atlas).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(
    selector.locator('[data-hit-region="front-chest"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await selector.getByRole("button", { name: "Clear selected muscle" }).click();
  await expect(page.getByTestId("muscle-value")).toHaveText("null");
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("provider coordinator stays synchronized and navigation does not query exercises", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openAnatomyFixture(page);
  const selector = visibleSelector(page);
  await page
    .getByRole("textbox", { name: "Search exercises", exact: true })
    .fill("exercise");
  await page.locator("#exercise-library-target-muscle").click();
  await page
    .getByRole("menuitem", {
      name: "Pectoralis Major Clavicular Head",
      exact: true,
    })
    .press("Enter");
  await expect(
    selector.locator('[data-hit-region="front-chest"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await selector
    .getByRole("button", { name: "Anterior deltoids", exact: true })
    .press("Enter");
  await expect(page.locator("#exercise-library-target-muscle")).toContainText(
    "Anterior Deltoid",
  );
  const before = await page.getByTestId("selection-events").textContent();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/\/functions\/v1\/|\/rest\/v1\//.test(request.url()))
      requests.push(request.url());
  });
  await selector.getByRole("button", { name: "Expand anatomy" }).click();
  const atlas = page.getByRole("dialog", { name: atlasName });
  await atlas
    .getByRole("searchbox", { name: "Search muscles" })
    .fill("shoulder");
  await atlas
    .locator('[data-hit-region="front-chest"] .anatomy-hit-area')
    .first()
    .hover();
  await expect(atlas.locator(".anatomy-preview")).toContainText(
    "Preview · Pectorals",
  );
  await atlas.getByRole("button", { name: "Back", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Search exercises", exact: true }),
  ).toHaveValue("exercise");
  await expect(page.getByTestId("selection-events")).toHaveText(before!);
  expect(requests).toEqual([]);
});

test("active provider catalog makes no new request for atlas navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/exercise-dataset-search", async (route) => {
    if (route.request().method() === "POST")
      requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      },
      body: JSON.stringify({ providerPayload: [] }),
    });
  });
  await openAnatomyFixture(page);
  await page.getByRole("button", { name: "Open workout picker" }).click();
  const picker = page.getByRole("dialog", {
    name: "Add exercises",
    exact: true,
  });
  await picker.getByRole("tab", { name: "Provider Catalog" }).click();
  await expect(
    picker.getByRole("heading", { name: "No provider results" }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await picker.getByRole("button", { name: "Expand anatomy" }).click();
  const atlas = page.getByRole("dialog", { name: atlasName });
  await atlas.getByRole("searchbox", { name: "Search muscles" }).fill("back");
  await atlas.getByRole("button", { name: "Back", exact: true }).click();
  await atlas
    .locator('[data-hit-region="back-latissimus-dorsi"] .anatomy-hit-area')
    .first()
    .hover();
  await expect(atlas.locator(".anatomy-preview")).toContainText(
    "Latissimus dorsi",
  );
  await page.keyboard.press("Escape");
  expect(requests).toHaveLength(1);
  await picker.getByRole("button", { name: "Front", exact: true }).click();
  await picker
    .getByRole("button", { name: "Anterior deltoids", exact: true })
    .press("Enter");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].target).toBe("ANTERIOR DELTOID");
});

for (const width of [1440, 768, 375]) {
  test(`visual states and nested workout picker at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAnatomyFixture(page);
    await page.evaluate(() => document.fonts.ready);
    if (width < 1280)
      await page.locator(".exercise-library-mobile-filters summary").click();
    const selector = visibleSelector(page);
    const directory = join(artifactRoot, String(width));
    mkdirSync(directory, { recursive: true });
    const capture = async (name: string) =>
      selector.screenshot({ path: join(directory, `${name}.png`) });
    await capture("neutral-front");
    await expectAnatomyFramed(selector);
    await page.screenshot({
      path: join(directory, "library.png"),
      fullPage: true,
    });
    for (const [surface, name, file] of [
      ["Front", "Pectorals", "pectorals"],
      ["Front", "Hip abductors", "hip-abductors"],
      ["Front", "Quadriceps", "quadriceps"],
      ["Back", "", "neutral-back"],
      ["Back", "Posterior deltoids", "posterior-deltoids"],
      ["Back", "Latissimus dorsi", "lats"],
    ]) {
      const clear = selector.getByRole("button", {
        name: "Clear selected muscle",
      });
      if (await clear.isEnabled()) await clear.click();
      await selector
        .getByRole("button", { name: surface, exact: true })
        .click();
      if (name)
        await selector
          .getByRole("button", { name, exact: true })
          .press("Enter");
      // Keep selection captures distinct from the keyboard-focus capture.
      await selector.locator(".anatomy-selector-heading h3").click();
      await capture(file);
    }
    await selector
      .getByRole("button", { name: "Latissimus dorsi", exact: true })
      .focus();
    await capture("keyboard-focus");
    await selector.getByRole("tab", { name: "Muscle list" }).click();
    await selector
      .getByRole("searchbox", { name: "Search muscles" })
      .fill("back");
    await capture("muscle-list");
    await selector.getByRole("button", { name: "Expand anatomy" }).click();
    const atlas = page.getByRole("dialog", { name: atlasName });
    await atlas.screenshot({ path: join(directory, "expanded.png") });
    await expectAnatomyFramed(atlas);
    await expectNoOverflow(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open workout picker" }).click();
    const picker = page.getByRole("dialog", {
      name: "Add exercises",
      exact: true,
    });
    await picker.getByRole("button", { name: /^Pectorals exercise/ }).click();
    await picker
      .getByRole("button", {
        name: /^Anterior deltoids exercise/,
      })
      .click();
    const selectedIdentities = await page
      .getByTestId("exercise-identities")
      .textContent();
    expect(JSON.parse(selectedIdentities!)).toHaveLength(2);
    if (width < 1024)
      await picker.locator(".exercise-picker-mobile-filters summary").click();
    await picker.screenshot({ path: join(directory, "picker.png") });
    const expand = picker.getByRole("button", { name: "Expand anatomy" });
    await expand.click();
    await atlas
      .getByRole("button", { name: "Quadriceps", exact: true })
      .press("Enter");
    await atlas.screenshot({ path: join(directory, "picker-expanded.png") });
    await expectNoOverflow(page);
    await page.keyboard.press("Escape");
    await expect(picker).toBeVisible();
    await expect(page.getByTestId("exercise-identities")).toHaveText(
      selectedIdentities!,
    );
    await expect(expand).toBeFocused();
    await expect(picker.getByText("2 selected", { exact: true })).toBeVisible();
    await expect(
      picker.locator(".anatomy-selection-context").filter({ visible: true }),
    ).toContainText("Quadriceps");
    writeFileSync(
      join(directory, "layout.json"),
      JSON.stringify(
        {
          width,
          selector: await selector.first().boundingBox(),
          picker: await picker.boundingBox(),
        },
        null,
        2,
      ),
    );
  });
}
