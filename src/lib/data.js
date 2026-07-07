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

function orderDeployments(list) {
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
