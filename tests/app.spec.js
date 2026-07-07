import { test, expect } from "@playwright/test";

const REGION = "Sweden Central";

async function waitForData(page) {
  await page.goto("/");
  await expect(page.getByTestId("filters")).toBeVisible({ timeout: 20000 });
}

function combo(page, label) {
  return page.getByTestId("filters").getByRole("combobox", { name: label });
}

async function pickOption(page, label, optionText) {
  const input = combo(page, label);
  await input.click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

async function pickRegion(page, label = REGION) {
  await pickOption(page, "Region *", label);
}

test("region selection is mandatory before any pricing shows", async ({ page }) => {
  await waitForData(page);
  await expect(page.getByTestId("region-prompt")).toBeVisible();
  await expect(page.getByTestId("pricing-table")).toHaveCount(0);

  await pickRegion(page);
  await expect(page.getByTestId("region-prompt")).toHaveCount(0);
  await expect(page.getByTestId("pricing-table")).toBeVisible();
});

test("region dropdown uses full Azure names (Sweden Central, not SE Central)", async ({ page }) => {
  await waitForData(page);
  await combo(page, "Region *").click();
  const opts = await page.getByRole("listbox").getByRole("option").allTextContents();
  expect(opts).toContain("Sweden Central");
  expect(opts).toContain("East US 2");
  expect(opts.some((o) => o === "SE Central")).toBe(false);
});

test("typing in a dropdown live-filters its options while it's open", async ({ page }) => {
  await waitForData(page);
  const input = combo(page, "Region *");
  await input.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await input.fill("swed");
  const opts = await listbox.getByRole("option").allTextContents();
  expect(opts.some((o) => o.includes("Sweden"))).toBe(true);
  expect(opts.some((o) => o.includes("Japan"))).toBe(false);
  await listbox.getByRole("option", { name: "Sweden Central", exact: true }).click();
  await expect(input).toHaveValue("Sweden Central");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("loads data and shows staleness", async ({ page }) => {
  await waitForData(page);
  await expect(page.getByTestId("staleness")).toContainText("Data snapshot");
});

test("comparison table renders models, deployment columns and token prices", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  const table = page.getByTestId("table-Tokens");
  await expect(table).toBeVisible();
  await expect(table.locator("thead")).toContainText("Global");
  await expect(table.locator("tbody")).toContainText("$");
  expect(await table.locator("tbody tr").count()).toBeGreaterThan(20);
});

test("provisioned (PTU) pricing is integrated as columns in each model row", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await pickOption(page, "Provider", "OpenAI");
  await pickOption(page, "Model", "GPT 5.4 mini");
  const table = page.getByTestId("table-Tokens");
  await expect(table.locator("thead")).toContainText("Provisioned");
  await expect(table.locator("tbody")).toContainText("PTU/hr");
});

test("clicking a table header sorts rows and toggles direction on repeat clicks", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  const table = page.getByTestId("table-Tokens");
  const providerHeader = table.getByRole("columnheader", { name: "Provider" });
  const firstProviderCell = () => table.locator("tbody tr").first().locator("td.pt-prov");

  // Default is ascending by provider.
  await expect(providerHeader).toHaveAttribute("aria-sort", "ascending");
  const ascFirst = await firstProviderCell().textContent();

  await providerHeader.click();
  await expect(providerHeader).toHaveAttribute("aria-sort", "descending");
  const descFirst = await firstProviderCell().textContent();
  expect(descFirst).not.toBe(ascFirst);

  await providerHeader.click();
  await expect(providerHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(firstProviderCell()).toHaveText(ascFirst);
});

test("PTU still has a dedicated table when its category is selected", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await pickOption(page, "Category", "PTU");
  const sec = page.getByTestId("section-PTU");
  await expect(sec).toBeVisible();
  await expect(sec).toContainText("PTU/hr");
});

test("non-token billing categories are present (Images, Pages)", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await expect(page.getByTestId("section-Images")).toBeVisible();
  await expect(page.getByTestId("section-Pages")).toBeVisible();
});

test("provider filter narrows results and updates the URL", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  const before = Number((await page.getByTestId("result-count").textContent()).replace(/\D/g, ""));
  await pickOption(page, "Provider", "OpenAI");
  await expect.poll(async () =>
    Number((await page.getByTestId("result-count").textContent()).replace(/\D/g, ""))
  ).toBeLessThan(before);
  await expect(page).toHaveURL(/provider=OpenAI/);
  await expect(page).toHaveURL(/region=swedencentral/);
});

test("model detail drawer opens with raw meters and CSV export button", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await pickOption(page, "Provider", "OpenAI");
  await page.getByTestId("table-Tokens").locator("tbody tr td.pt-model button").first().click();
  const drawer = page.getByTestId("model-detail");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("raw meters");
  await expect(drawer.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
});

test("provisioned + specific model shows guided no-results with a working fix", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await pickOption(page, "Provider", "OpenAI");
  await pickOption(page, "Model", "GPT 5.4 mini");
  await pickOption(page, "Category", "PTU");

  const nr = page.getByTestId("no-results");
  await expect(nr).toBeVisible();
  await expect(nr).toContainText("Provisioned / PTU");
  await nr.getByRole("button", { name: /Clear Model/ }).click();
  await expect(page.getByTestId("no-results")).toHaveCount(0);
});

test("reset clears filters and URL", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await pickOption(page, "Provider", "OpenAI");
  await expect(page).toHaveURL(/provider=OpenAI/);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/provider=OpenAI/);
  // region cleared too -> prompt returns
  await expect(page.getByTestId("region-prompt")).toBeVisible();
});

test("deep link via URL applies region + provider on load", async ({ page }) => {
  await page.goto("/?region=swedencentral&provider=OpenAI");
  await expect(page.getByTestId("pricing-table")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("region-prompt")).toHaveCount(0);
  await expect(page.getByTestId("table-Tokens").locator("tbody td.pt-prov").first()).toHaveText("OpenAI");
});
