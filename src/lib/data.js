// Client-side data layer: load the snapshot, build filter option lists, and
// group rows for the comparison table and calculator.
import { regionName, UNIVERSAL_REGIONS } from "./regions.js";

export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const [pricing, meta] = await Promise.all([
    fetch(`${base}data/pricing.json`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load pricing data (${r.status})`);
      return r.json();
    }),
    fetch(`${base}data/meta.json`).then((r) => (r.ok ? r.json() : null)),
  ]);
  return { records: pricing, meta };
}

export const TOKEN_DIRECTIONS = ["Input", "Output", "Cached Input"];

export function buildRegionLabels(records) {
  const map = new Map();
  for (const r of records) {
    if (r.region && !map.has(r.region)) map.set(r.region, regionName(r.region));
  }
  return map;
}

export function uniqueSorted(records, key) {
  return [...new Set(records.map((r) => r[key]).filter((v) => v !== "" && v != null))].sort(
    (a, b) => String(a).localeCompare(String(b))
  );
}

export function applyFilters(records, f) {
  const q = (f.search || "").trim().toLowerCase();
  return records.filter((r) => {
    if (f.provider && r.provider !== f.provider) return false;
    // A geographic region also includes "Global" (and empty) pricing, which is
    // universal — Global meters apply in every region.
    if (f.region && r.region !== f.region && !UNIVERSAL_REGIONS.has(r.region)) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.model && r.model !== f.model) return false;
    if (f.hideLowConfidence && r.lowConfidence) return false;
    if (q) {
      const hay = `${r.model} ${r.productName} ${r.meterName} ${r.skuName} ${r.provider}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Deterministic price pick when several rows collapse to one cell (e.g. several
// regions, effective dates). Prefer most recent effectiveDate, then lowest price.
// Value is the per-1M token price for token rows, else the native unit price.
function valueOf(r) {
  return r.category === "Tokens" ? r.pricePer1M : r.price;
}

function pickPrice(rows) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const d = (b.effectiveDate || "").localeCompare(a.effectiveDate || "");
    if (d !== 0) return d;
    return valueOf(a) - valueOf(b);
  });
  const best = sorted[0];
  const prices = [...new Set(rows.map(valueOf))];
  return {
    price: valueOf(best),
    unit: best.unit,
    measure: best.measure,
    term: best.term,
    type: best.type,
    count: rows.length,
    varies: prices.length > 1,
    min: Math.min(...prices),
    max: Math.max(...prices),
    sample: best,
  };
}

const DEPLOYMENT_ORDER = [
  "Global", "Data Zone", "Regional",
  "Global Batch", "Data Zone Batch", "Regional Batch",
  "Provisioned", "Provisioned (Global)", "Provisioned (Data Zone)", "Provisioned (Regional)",
  "Fine-tuning", "Fine-tuning (Global)", "Fine-tuning (Data Zone)", "Fine-tuning (Regional)",
  "Standard",
];

export function orderDeployments(list) {
  return [...list].sort((a, b) => {
    const ia = DEPLOYMENT_ORDER.indexOf(a);
    const ib = DEPLOYMENT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

// Display order for the per-category table sections.
export const CATEGORY_ORDER = ["Tokens", "PTU", "Images", "Pages", "Characters", "Search", "Session", "Hosting", "Calls", "Other"];

export const CATEGORY_HINTS = {
  Tokens: "USD per 1M tokens. In = input, Out = output, Cached = cached input.",
  PTU: "Provisioned Throughput Units — billed per PTU. /hr = hourly (pay-as-you-go), /mo = monthly; reservation commitments show their term (1 Month / 1 Year).",
  Images: "Billed per image / megapixel.",
  Pages: "Billed per page (most Doc AI / OCR meters are per 1K pages).",
  Characters: "Text-to-speech, billed per character (per 1K / 1M).",
  Search: "Billed per GB (file search / storage), often per day.",
  Session: "Billed per active session.",
  Hosting: "Fine-tuning training / hosting, billed per unit-hour.",
  Calls: "Billed per API/tool call.",
  Other: "Miscellaneous units (e.g. per second of generated video).",
};

export function categoriesPresent(records) {
  const set = new Set(records.map((r) => r.category));
  const ordered = CATEGORY_ORDER.filter((c) => set.has(c));
  const extra = [...set].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...ordered, ...extra];
}

// Generic comparison matrix for ANY billing category. Rows = models, columns =
// deployment types. Each cell holds one or more priced "series": for token
// categories the series are Input/Output/Cached (per 1M tokens); for everything
// else the series are the billing measures (PTU/hr, megapixel, page, session…).
//
// ptuRecords (optional): provider-level PTU rows used to graft Provisioned
// columns onto every model row, since PTU is billed per-provider not per-model.
const DIR_RANK = { Input: 0, Output: 1, "Cached Input": 2 };
function seriesRank(s) {
  return DIR_RANK[s] != null ? DIR_RANK[s] : 100;
}
function cellArray(sMap) {
  return [...sMap.keys()]
    .sort((a, b) => seriesRank(a) - seriesRank(b) || a.localeCompare(b))
    .map((key) => {
      const rows = sMap.get(key);
      const std = rows.filter((r) => !r.priorityProcessing);
      const pp = rows.filter((r) => r.priorityProcessing);
      return {
        key,
        p: std.length ? pickPrice(std) : null,
        pp: pp.length ? pickPrice(pp) : null,
      };
    });
}

function ptuByProvider(ptuRecords) {
  const map = new Map(); // provider -> Map<deployment, Map<series, rows[]>>
  const deps = new Set();
  for (const r of ptuRecords) {
    const series = r.term ? `${r.measure} · ${r.term}` : r.measure;
    if (!map.has(r.provider)) map.set(r.provider, new Map());
    const dm = map.get(r.provider);
    if (!dm.has(r.deployment)) dm.set(r.deployment, new Map());
    const sm = dm.get(r.deployment);
    if (!sm.has(series)) sm.set(series, []);
    sm.get(series).push(r);
    deps.add(r.deployment);
  }
  return { map, deps: [...deps] };
}

export function buildCategoryMatrix(records, category, ptuRecords = null) {
  const isToken = category === "Tokens";
  const rows0 = records.filter((r) => r.category === category && valueOf(r) != null);
  const baseDeps = uniqueSorted(rows0, "deployment");

  const tree = new Map();
  for (const r of rows0) {
    const mk = `${r.provider}||${r.model}`;
    if (!tree.has(mk)) tree.set(mk, { provider: r.provider, model: r.model, deps: new Map() });
    const node = tree.get(mk);
    if (!node.deps.has(r.deployment)) node.deps.set(r.deployment, new Map());
    const dep = node.deps.get(r.deployment);
    const series = isToken ? r.direction : r.term ? `${r.measure} · ${r.term}` : r.measure;
    if (!dep.has(series)) dep.set(series, []);
    dep.get(series).push(r);
  }

  // Provider-derived Provisioned (PTU) columns, attached to every model row.
  const ptu = ptuRecords && category !== "PTU" ? ptuByProvider(ptuRecords) : null;

  const rows = [];
  for (const [, node] of tree) {
    const cells = {};
    for (const [dep, sMap] of node.deps) cells[dep] = cellArray(sMap);
    if (ptu && ptu.map.has(node.provider)) {
      for (const [dep, sMap] of ptu.map.get(node.provider)) {
        if (!cells[dep]) cells[dep] = cellArray(sMap);
      }
    }
    rows.push({ provider: node.provider, model: node.model, cells, hasPTU: !!(ptu && ptu.map.has(node.provider)) });
  }
  rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));

  const allDeps = [...new Set([...baseDeps, ...(ptu ? ptu.deps : [])])];
  const deployments = orderDeployments(allDeps);
  return { rows, deployments, isToken, category, augmented: !!ptu };
}

// Token calculator: collapse to one price per model+deployment+direction.
export function buildModelPricing(records) {
  const tokenRows = records.filter((r) => r.category === "Tokens" && r.pricePer1M != null);
  const map = new Map();
  for (const r of tokenRows) {
    const key = `${r.provider}||${r.model}||${r.deployment}`;
    if (!map.has(key)) {
      map.set(key, {
        provider: r.provider,
        model: r.model,
        deployment: r.deployment,
        lowConfidence: r.lowConfidence,
        dirs: {},
      });
    }
    (map.get(key).dirs[r.direction] ||= []).push(r);
  }
  const out = [];
  for (const [, e] of map) {
    const priced = {};
    for (const dir of Object.keys(e.dirs)) priced[dir] = pickPrice(e.dirs[dir]);
    out.push({ ...e, prices: priced });
  }
  return out;
}

// Unit calculator (non-token): one price per model+deployment+measure+term.
export function buildUnitPricing(records, category) {
  const rows0 = records.filter((r) => r.category === category);
  const map = new Map();
  for (const r of rows0) {
    const key = `${r.provider}||${r.model}||${r.deployment}||${r.measure}||${r.term || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        provider: r.provider, model: r.model, deployment: r.deployment,
        measure: r.measure, unit: r.unit, isHourly: r.isHourly, term: r.term, type: r.type, rows: [],
      });
    }
    map.get(key).rows.push(r);
  }
  const out = [];
  for (const [, e] of map) {
    const p = pickPrice(e.rows);
    out.push({
      provider: e.provider, model: e.model, deployment: e.deployment,
      measure: e.measure, unit: e.unit, isHourly: e.isHourly, term: e.term, type: e.type,
      price: p.price, varies: p.varies, min: p.min, max: p.max, meterName: p.sample.meterName,
    });
  }
  return out;
}

export function fmtUSD(n, max = 4) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: max,
  }).format(n);
}

export function fmtNum(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

// ---- Pricing calculator ---------------------------------------------------
// Per-region view used by the Calculator tab. Token pricing is per model+
// deployment; PTU (provisioned) pricing is per provider and grafted onto every
// model of that provider, mirroring the comparison table. Region filtering
// includes universal (Global) meters via applyFilters.
export function buildRegionCalcData(records, region) {
  const scoped = applyFilters(records, { region });

  // Token pricing mirrors the comparison table's default: prefer the standard
  // (non-pp) meter per direction, falling back to priority-processing only when
  // no standard meter exists for that direction.
  const idxTok = (entries) => {
    const m = new Map();
    for (const e of entries) m.set(`${e.provider}||${e.model}||${e.deployment}`, e);
    return m;
  };
  const std = idxTok(buildModelPricing(scoped.filter((r) => !r.priorityProcessing)));
  const pp = idxTok(buildModelPricing(scoped.filter((r) => r.priorityProcessing)));

  const models = new Map();          // key -> { key, provider, model }
  const tokenPrice = new Map();      // `${key}||${deployment}` -> { Input, Output, "Cached Input" }
  const tokenDeps = new Map();       // key -> Set<deployment>
  for (const tripleKey of new Set([...std.keys(), ...pp.keys()])) {
    const [provider, model, deployment] = tripleKey.split("||");
    const s = std.get(tripleKey);
    const p = pp.get(tripleKey);
    const prices = {};
    for (const dir of TOKEN_DIRECTIONS) {
      const chosen = s?.prices?.[dir] ?? p?.prices?.[dir];
      if (chosen) prices[dir] = chosen;
    }
    const key = `${provider}||${model}`;
    if (!models.has(key)) models.set(key, { key, provider, model });
    tokenPrice.set(`${key}||${deployment}`, prices);
    if (!tokenDeps.has(key)) tokenDeps.set(key, new Set());
    tokenDeps.get(key).add(deployment);
  }

  // PTU is billed per provider; prefer the hourly consumption meter per deployment.
  const ptuEntries = buildUnitPricing(scoped, "PTU");
  const ptuByProvider = new Map();   // provider -> Map<deployment, { deployment, price, measure, isHourly, meterName }>
  for (const e of ptuEntries) {
    if (!ptuByProvider.has(e.provider)) ptuByProvider.set(e.provider, new Map());
    const dm = ptuByProvider.get(e.provider);
    const existing = dm.get(e.deployment);
    const isHourly = /\/hr$/i.test(e.measure) || e.isHourly;
    if (!existing || (isHourly && !existing.isHourly)) {
      dm.set(e.deployment, {
        deployment: e.deployment, price: e.price, measure: e.measure, isHourly, meterName: e.meterName,
      });
    }
  }

  const modelList = [...models.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
  );
  return { models: modelList, tokenPrice, tokenDeps, ptuByProvider };
}

// Deployments a given model can be priced under: its own token deployments plus
// its provider's PTU (provisioned) deployments.
export function calcDeploymentsFor(regionData, modelKey) {
  if (!regionData || !modelKey) return [];
  const [provider] = modelKey.split("||");
  const tokenSet = regionData.tokenDeps.get(modelKey) || new Set();
  const ptuMap = regionData.ptuByProvider.get(provider);
  const all = new Set(tokenSet);
  if (ptuMap) for (const d of ptuMap.keys()) all.add(d);
  return orderDeployments([...all]);
}

// Resolve the pricing + billing mode for one calculator row.
export function calcPricing(regionData, modelKey, deployment) {
  if (!regionData || !modelKey || !deployment) return null;
  const [provider] = modelKey.split("||");
  const token = regionData.tokenPrice.get(`${modelKey}||${deployment}`);
  if (token && (regionData.tokenDeps.get(modelKey) || new Set()).has(deployment)) {
    return { mode: "tokens", prices: token };
  }
  const ptu = regionData.ptuByProvider.get(provider)?.get(deployment);
  if (ptu) return { mode: "ptu", ptu };
  return null;
}

// Total cost for a row given its inputs. Token counts are entered in millions
// and priced per 1M; PTU is rate × units (× hours for hourly meters).
export function calcRowTotal(pricing, inputs) {
  if (!pricing) return null;
  if (pricing.mode === "tokens") {
    let total = 0;
    for (const c of calcTokenCosts(pricing, inputs)) if (c.cost != null) total += c.cost;
    return total;
  }
  const units = inputs.ptus || 0;
  const hours = pricing.ptu.isHourly ? (inputs.hours ?? 0) : 1;
  return units * pricing.ptu.price * hours;
}

// Per-direction token cost contributions (tokens are in millions, priced per 1M).
export function calcTokenCosts(pricing, inputs) {
  const dirs = [
    ["Input", inputs.inTokens], ["Output", inputs.outTokens], ["Cached Input", inputs.cachedTokens],
  ];
  return dirs.map(([dir, millions]) => {
    const p = pricing?.prices?.[dir];
    return { dir, cost: p ? (millions || 0) * p.price : null };
  });
}
