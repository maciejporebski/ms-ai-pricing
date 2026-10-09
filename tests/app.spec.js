import { test, expect } from "@playwright/test";
import { normalize } from "../scripts/normalize.mjs";
import { readFile } from "node:fs/promises";

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

test("priority processing prices show in brackets with a hover explanation", async ({ page }) => {
  await waitForData(page);
  await pickRegion(page);
  await pickOption(page, "Provider", "OpenAI");
  await pickOption(page, "Model", "GPT 5");
  const table = page.getByTestId("table-Tokens");
  const pp = table.locator(".pt-pp").first();
  await expect(pp).toContainText("pp:");
  await expect(pp).toHaveAttribute("title", /priority processing/);
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

async function pickInRow(row, page, label, optionText) {
  await row.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

test("defaults to the Retail Prices tab", async ({ page }) => {
  await waitForData(page);
  await expect(page.getByTestId("tab-retail")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("tab-calc")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("region-prompt")).toBeVisible();
  await expect(page.getByTestId("calculator")).toHaveCount(0);
});

test("calculator computes token cost and adds rows to compare", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("tab-calc").click();
  const calc = page.getByTestId("calculator");
  await expect(calc).toBeVisible();

  const row = calc.getByTestId("calc-row").first();
  await pickInRow(row, page, "Location", REGION);
  await pickInRow(row, page, "Model", "OpenAI — GPT 5");
  await pickInRow(row, page, "Hosting type", "Global");
  await row.getByRole("spinbutton", { name: "Input (M tokens)" }).fill("1");
  await expect(row.getByTestId("calc-total")).toContainText("$1.25");

  await page.getByTestId("calc-add-row").click();
  await expect(calc.getByTestId("calc-row")).toHaveCount(2);
});

test("calculator computes PTU cost from provisioned hosting", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("tab-calc").click();
  const row = page.getByTestId("calculator").getByTestId("calc-row").first();
  await pickInRow(row, page, "Location", REGION);
  await pickInRow(row, page, "Model", "OpenAI — GPT 5");
  await pickInRow(row, page, "Hosting type", "Provisioned (Global) · PTU");
  await row.getByRole("spinbutton", { name: "PTUs" }).fill("10");
  await row.getByRole("spinbutton", { name: "Hours" }).fill("730");
  await expect(row.getByTestId("calc-total")).toContainText("$7,300.00");
});

test("priority processing checkbox switches to pp pricing for supported models", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("tab-calc").click();
  const row = page.getByTestId("calculator").getByTestId("calc-row").first();
  await pickInRow(row, page, "Location", REGION);
  await pickInRow(row, page, "Model", "OpenAI — GPT 5");
  await pickInRow(row, page, "Hosting type", "Global");
  await row.getByRole("spinbutton", { name: "Input (M tokens)" }).fill("1");
  await expect(row.getByTestId("calc-total")).toContainText("$1.25");
  await row.getByTestId("calc-pp").locator("input").check();
  await expect(row.getByTestId("calc-total")).toContainText("$2.50");
});

test("calculator persists rows across reload and tab navigation", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("tab-calc").click();
  const row = page.getByTestId("calculator").getByTestId("calc-row").first();
  await pickInRow(row, page, "Location", REGION);
  await pickInRow(row, page, "Model", "OpenAI — GPT 5");
  await pickInRow(row, page, "Hosting type", "Global");
  await row.getByRole("spinbutton", { name: "Input (M tokens)" }).fill("3");

  await page.reload();
  await expect(page.getByTestId("filters")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("tab-calc").click();
  const restored = page.getByTestId("calculator").getByTestId("calc-row").first();
  await expect(restored.getByRole("spinbutton", { name: "Input (M tokens)" })).toHaveValue("3");
  await expect(restored.getByTestId("calc-total")).toContainText("$3.75");
});

test("clear button resets the calculator to a single empty row", async ({ page }) => {
  await waitForData(page);
  await page.getByTestId("tab-calc").click();
  const calc = page.getByTestId("calculator");
  await pickInRow(calc.getByTestId("calc-row").first(), page, "Location", REGION);
  await page.getByTestId("calc-add-row").click();
  await expect(calc.getByTestId("calc-row")).toHaveCount(2);
  await page.getByTestId("calc-clear").click();
  await expect(calc.getByTestId("calc-row")).toHaveCount(1);
  await expect(calc.getByTestId("calc-row").first().getByRole("combobox", { name: "Location", exact: true }))
    .toHaveValue("");
});

async function useNewerGptMeters(page) {
  const records = [];
  for (const [prefix, productName] of [
    ["5.6 terra", "Azure OpenAI GPT5"],
    ["6-astra", "Azure OpenAI GPT6"],
    ["6.1-sol", "Azure OpenAI GPT6"],
  ]) {
    for (const [context, multiplier] of [["ShortCo", 1], ["LongCo", 2]]) {
      for (const [billing, price] of [["Inp", 2], ["Opt", 10], ["Cd Inp", 0.1], ["Cd Wr", 2.5]]) {
        for (const processing of ["Std", "PP"]) {
          const skuName = `${prefix} ${context} ${billing} ${processing} Gl`;
          records.push(normalize({
            productName, skuName, meterName: `${skuName} 1M Tokens`,
            armRegionName: "swedencentral", location: REGION,
            unitOfMeasure: "1M", retailPrice: price * multiplier * (processing === "PP" ? 2 : 1),
            type: "Consumption", effectiveStartDate: "2026-10-09T00:00:00Z",
          }));
        }
      }
    }
  }
  await page.route("**/data/pricing.json", (route) => route.fulfill({ json: records }));
  await page.route("**/data/meta.json", (route) => route.fulfill({ json: {} }));
}

test("newer GPT names group billing meters but keep context tiers and cache writes distinct", async ({ page }) => {
  await useNewerGptMeters(page);
  await waitForData(page);
  await pickRegion(page);
  const table = page.getByTestId("table-Tokens");
  await expect(table.locator("tbody tr")).toHaveCount(6);
  for (const model of ["GPT 5.6 terra", "GPT 6 astra", "GPT 6.1 sol"]) {
    await expect(table.getByRole("button", { name: `${model} (short context)`, exact: true })).toBeVisible();
    await expect(table.getByRole("button", { name: `${model} (long context)`, exact: true })).toBeVisible();
  }
  await pickOption(page, "Model", "GPT 6.1 sol (short context)");
  const prices = table.locator("tbody tr").first();
  await expect(prices).toContainText("Cached$0.10 (pp: $0.20)");
  await expect(prices).toContainText("Cache Write$2.50 (pp: $5.00)");
});

test("calculator prices normalized GPT context tiers including cache writes", async ({ page }) => {
  await useNewerGptMeters(page);
  await waitForData(page);
  await page.getByTestId("tab-calc").click();
  const row = page.getByTestId("calculator").getByTestId("calc-row").first();
  await pickInRow(row, page, "Location", REGION);
  await pickInRow(row, page, "Model", "OpenAI — GPT 6.1 sol (short context)");
  await pickInRow(row, page, "Hosting type", "Global");
  await row.getByRole("spinbutton", { name: /^Cached \(M tokens\)/ }).fill("1");
  await expect(row.getByTestId("calc-total")).toContainText("$0.10");
  await row.getByRole("spinbutton", { name: /^Cache write \(M tokens\)/ }).fill("1");
  await expect(row.getByTestId("calc-total")).toContainText("$2.60");
  await expect(page.getByTestId("calc-grand-total")).toContainText("$2.60");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("calc-export").click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  const [headers, values] = csv.split("\r\n").map((line) => line.split(","));
  const valueOf = (header) => values[headers.indexOf(header)];
  expect(valueOf("Cache Write (M tokens)")).toBe("1");
  expect(valueOf("Cache Write Cost (USD)")).toBe("2.5000");
  expect(valueOf("Cache Write Meter")).toBe("6.1-sol ShortCo Cd Wr Std Gl 1M Tokens");
  expect(valueOf("Cached Cost (USD)")).toBe("0.1000");
  expect(valueOf("Total (USD)")).toBe("2.6000");
  await row.getByTestId("calc-pp").locator("input").check();
  await expect(row.getByTestId("calc-total")).toContainText("$5.20");
  await expect(page.getByTestId("calc-grand-total")).toContainText("$5.20");
  await row.getByTestId("calc-pp").locator("input").uncheck();
  await pickInRow(row, page, "Model", "OpenAI — GPT 6.1 sol (long context)");
  await pickInRow(row, page, "Hosting type", "Global");
  await expect(row.getByTestId("calc-total")).toContainText("$5.20");
  await page.reload();
  await expect(page.getByTestId("filters")).toBeVisible();
  await page.getByTestId("tab-calc").click();
  const restored = page.getByTestId("calculator").getByTestId("calc-row").first();
  await expect(restored.getByRole("spinbutton", { name: /^Cache write \(M tokens\)/ })).toHaveValue("1");
  await expect(restored.getByTestId("calc-total")).toContainText("$5.20");
  await expect(page.getByTestId("calc-grand-total")).toContainText("$5.20");
});
