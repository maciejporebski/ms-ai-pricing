import { test, expect } from "@playwright/test";

async function waitForData(page) {
  await page.goto("/");
  await expect(page.getByTestId("filters")).toBeVisible({ timeout: 20000 });
}

test("loads data and shows staleness + result count", async ({ page }) => {
  await waitForData(page);
  await expect(page.getByTestId("staleness")).toContainText("Data snapshot");
  const count = await page.getByTestId("result-count").textContent();
  expect(Number(count.replace(/[^\d]/g, ""))).toBeGreaterThan(10000);
});

test("comparison table renders models, deployment columns and token prices", async ({ page }) => {
  await waitForData(page);
  const table = page.getByTestId("table-Tokens");
  await expect(table).toBeVisible();
  await expect(table.locator("thead")).toContainText("Global");
  await expect(table.locator("tbody")).toContainText("$");
  const rowCount = await table.locator("tbody tr").count();
  expect(rowCount).toBeGreaterThan(20);
});

test("provisioned (PTU) pricing is integrated as columns in each model row", async ({ page }) => {
  await waitForData(page);
  const s = page.getByTestId("filters").locator("select");
  await s.first().selectOption({ label: "OpenAI" });
  await s.nth(1).selectOption({ label: "5.4 mini" });
  const tbl = page.getByTestId("table-Tokens");
  await expect(tbl).toBeVisible();
  // Provisioned columns are grafted on from the provider's PTU pricing.
  await expect(tbl.locator("thead")).toContainText("Provisioned");
  await expect(tbl.locator("tbody")).toContainText("PTU/hr");
});

test("PTU still has a dedicated table when its category is selected", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("filters").locator("select").nth(4).selectOption({ label: "PTU" });
  const sec = page.getByTestId("section-PTU");
  await expect(sec).toBeVisible();
  await expect(sec).toContainText("PTU/hr");
});

test("non-token billing categories are present (Images, Pages)", async ({ page }) => {
  await waitForData(page);
  await expect(page.getByTestId("section-Images")).toBeVisible();
  await expect(page.getByTestId("section-Pages")).toBeVisible();
});

test("provider filter narrows results and updates the URL", async ({ page }) => {
  await waitForData(page);
  const before = Number((await page.getByTestId("result-count").textContent()).replace(/\D/g, ""));

  const providerSelect = page.getByTestId("filters").locator("select").first();
  await providerSelect.selectOption({ label: "OpenAI" });

  await expect.poll(async () =>
    Number((await page.getByTestId("result-count").textContent()).replace(/\D/g, ""))
  ).toBeLessThan(before);

  await expect(page).toHaveURL(/provider=OpenAI/);
});

test("region filter pins prices and reflects in URL", async ({ page }) => {
  await waitForData(page);
  const selects = page.getByTestId("filters").locator("select");
  await selects.nth(2).selectOption({ index: 1 });
  await expect(page).toHaveURL(/region=/);
  await expect(page.getByTestId("pricing-table")).toBeVisible();
});

test("model detail drawer opens with raw meters and CSV export button", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("filters").locator("select").first().selectOption({ label: "OpenAI" });
  await page.getByTestId("pricing-table").locator("tbody tr td.pt-model button").first().click();
  const drawer = page.getByTestId("model-detail");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("raw meters");
  await expect(drawer.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
});

test("calculator computes ranked monthly costs and reacts to input", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("tab-calculator").click();
  await expect(page.getByTestId("calculator")).toBeVisible();

  const firstCost = page.getByTestId("calc-cost").first();
  await expect(firstCost).toContainText("$");
  const initial = await firstCost.textContent();

  await page.getByTestId("calc-output").fill("100");
  await expect.poll(async () => (await firstCost.textContent())).not.toBe(initial);

  const costs = await page.getByTestId("calc-cost").allTextContents();
  const toNum = (s) => Number(s.replace(/[^0-9.]/g, ""));
  expect(toNum(costs[0])).toBeLessThanOrEqual(toNum(costs[1]));
});

test("calculator respects filters (provider scope)", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("filters").locator("select").first().selectOption({ label: "Cohere" });
  await page.getByTestId("tab-calculator").click();
  const table = page.getByTestId("calc-table");
  await expect(table).toBeVisible();
  const providers = await table.locator("tbody tr td:nth-child(2)").allTextContents();
  expect(providers.length).toBeGreaterThan(0);
  for (const p of providers) expect(p).toBe("Cohere");
});

test("calculator switches to unit mode for PTU (per-PTU) billing", async ({ page }) => {
  await waitForData(page);
  // category is the 5th select (provider, model, region, deployment, category)
  await page.getByTestId("filters").locator("select").nth(4).selectOption({ label: "PTU" });
  await page.getByTestId("tab-calculator").click();
  await expect(page.getByTestId("calc-qty")).toBeVisible();
  await expect(page.getByTestId("calc-hours")).toBeVisible();
  // token-specific inputs should be gone
  await expect(page.getByTestId("calc-input")).toHaveCount(0);
  const firstCost = page.getByTestId("calc-cost").first();
  await expect(firstCost).toContainText("$");
  await expect(page.getByTestId("calc-table")).toContainText("PTU");

  // Cost scales with units: doubling quantity must change the cheapest cost.
  const initial = await firstCost.textContent();
  await page.getByTestId("calc-qty").fill("5");
  await expect.poll(async () => await firstCost.textContent()).not.toBe(initial);
});

test("provisioned + specific model shows guided no-results with a working fix", async ({ page }) => {
  await waitForData(page);
  const selects = page.getByTestId("filters").locator("select");
  await selects.first().selectOption({ label: "OpenAI" });
  await selects.nth(1).selectOption({ label: "5.4 mini" });
  await selects.nth(3).selectOption({ label: "Provisioned (Data Zone)" });

  const nr = page.getByTestId("no-results");
  await expect(nr).toBeVisible();
  await expect(nr).toContainText("Provisioned / PTU");

  // The offered "Clear Model" fix must actually resolve to results.
  await nr.getByRole("button", { name: /Clear Model/ }).click();
  await expect(page.getByTestId("no-results")).toHaveCount(0);
  await expect(page.getByTestId("section-PTU")).toBeVisible();
});

test("reset clears filters and URL", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("filters").locator("select").first().selectOption({ label: "OpenAI" });
  await expect(page).toHaveURL(/provider=OpenAI/);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/provider=OpenAI/);
});

test("deep link via URL applies provider filter on load", async ({ page }) => {
  await page.goto("/?provider=Cohere&tab=calculator");
  await expect(page.getByTestId("calculator")).toBeVisible({ timeout: 20000 });
  const providers = await page.getByTestId("calc-table").locator("tbody tr td:nth-child(2)").allTextContents();
  for (const p of providers) expect(p).toBe("Cohere");
});
