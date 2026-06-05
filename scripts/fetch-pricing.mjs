// Build-time snapshot generator.
// Pages through the Azure Retail Prices API for Foundry Models, normalizes each
// row, and writes a compact dataset + metadata into src/data/.
// The Retail Prices API does not send CORS headers, so the browser cannot call
// it directly; this script runs in CI / locally and the JSON is served statically.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalize } from "./normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "data");

const BASE = "https://prices.azure.com/api/retail/prices";
const FILTER = "serviceName eq 'Foundry Models'";
const MIN_EXPECTED_ROWS = 5000; // guard against partial/empty snapshots

async function fetchAll() {
  let url = `${BASE}?currencyCode=USD&$filter=${encodeURIComponent(FILTER)}`;
  const items = [];
  let pages = 0;
  while (url) {
    let res;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(url);
      if (res.status === 429) {
        const wait = Number(res.headers.get("x-ms-ratelimit-retailPrices-retry-after") || 2);
        await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
        continue;
      }
      break;
    }
    if (!res.ok) throw new Error(`API request failed: ${res.status} ${res.statusText}`);
    const json = await res.json();
    items.push(...json.Items);
    url = json.NextPageLink;
    pages++;
    if (pages % 5 === 0) process.stdout.write(`  fetched ${items.length} rows...\n`);
  }
  return items;
}

function main() {
  return fetchAll().then((raw) => {
    console.log(`Fetched ${raw.length} raw rows.`);

    // Keep every billing model: Consumption (per-token, per-PTU-hour, per-image,
    // per-page, per-session, …) and Reservation (PTU 1-month/1-year commitments).
    const records = raw.map(normalize);

    if (records.length < MIN_EXPECTED_ROWS) {
      throw new Error(
        `Snapshot guard: only ${records.length} rows (expected >= ${MIN_EXPECTED_ROWS}). Aborting to avoid publishing a broken dataset.`
      );
    }

    const meta = {
      generatedAt: new Date().toISOString(),
      source: BASE,
      filter: FILTER,
      currency: "USD",
      rawRowCount: raw.length,
      recordCount: records.length,
      providers: [...new Set(records.map((r) => r.provider))].sort(),
      regions: [...new Set(records.map((r) => r.region))].filter(Boolean).sort(),
      deployments: [...new Set(records.map((r) => r.deployment))].sort(),
      categories: [...new Set(records.map((r) => r.category))].sort(),
      billingTypes: [...new Set(records.map((r) => r.type))].sort(),
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "pricing.json"), JSON.stringify(records));
    fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

    const bytes = fs.statSync(path.join(OUT_DIR, "pricing.json")).size;
    console.log(`Wrote ${records.length} records (${(bytes / 1e6).toFixed(2)} MB) to public/data/pricing.json`);
    console.log(`Providers: ${meta.providers.length}, Regions: ${meta.regions.length}, Deployments: ${meta.deployments.length}, Categories: ${meta.categories.join("/")}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
