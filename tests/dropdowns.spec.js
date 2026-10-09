import { test, expect } from "@playwright/test";

const prefix = "Model with a shared prefix and a very long version identifier ";
const models = [
  `${prefix}${"v".repeat(80)}-alpha`,
  `${prefix}${"v".repeat(80)}-beta`,
];

async function loadExampleModels(page) {
  await page.route("**/data/pricing.json", (route) => route.fulfill({
    json: models.map((model) => ({
      provider: "Example provider",
      model,
      region: "swedencentral",
      category: "Tokens",
      deployment: "Global",
      direction: "Input",
      price: 1,
      pricePer1M: 1,
      unit: "1M tokens",
      measure: "Tokens",
      type: "Consumption",
    })),
  }));
  await page.route("**/data/meta.json", (route) => route.fulfill({ json: {} }));
  await page.goto("/");
  await expect(page.getByTestId("filters")).toBeVisible();
}

async function expectReadableOptions(page) {
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const bounds = await list.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);

  const clipped = await list.getByRole("option").evaluateAll((options) =>
    options.filter((option) => {
      const range = document.createRange();
      range.selectNodeContents(option);
      const bounds = option.getBoundingClientRect();
      return option.scrollWidth > option.clientWidth ||
        Array.from(range.getClientRects()).some((rect) =>
          rect.left < bounds.left || rect.right > bounds.right ||
          rect.top < bounds.top || rect.bottom > bounds.bottom
        );
    }).map((option) => option.textContent)
  );
  expect(clipped).toEqual([]);
}

for (const width of [1280, 375]) {
  for (const tab of ["retail", "calc"]) {
    test(`${tab} model dropdown shows complete labels at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loadExampleModels(page);
      let container = page.getByTestId("filters");
      if (tab === "calc") {
        await page.getByTestId("tab-calc").click();
        container = page.getByTestId("calc-row").first();
        await container.getByRole("combobox", { name: "Location", exact: true }).click();
        await page.getByRole("option", { name: "Sweden Central", exact: true }).click();
      }

      const input = container.getByRole("combobox", { name: "Model", exact: true });
      if (width === 1280) {
        expect((await input.boundingBox()).width).toBeGreaterThanOrEqual(320);
      }
      await input.click();
      await expectReadableOptions(page);

      const label = tab === "calc" ? `Example provider — ${models[1]}` : models[1];
      await page.getByRole("option", { name: label, exact: true }).click();
      await expect(input).toHaveValue(label);
      await expect(page.getByRole("listbox")).toHaveCount(0);

      await input.click();
      await input.fill("-beta");
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
      await expectReadableOptions(page);
      await input.press("ArrowDown");
      await input.press("Enter");
      await expect(input).toHaveValue(label);
      await expect(page.getByRole("listbox")).toHaveCount(0);
    });
  }
}
