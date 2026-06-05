// Client-side data layer: load the snapshot, build filter option lists, and
// group rows for the comparison table and calculator.

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
    if (r.region && !map.has(r.region)) map.set(r.region, r.location || r.region);
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
    if (f.region && r.region !== f.region) return false;
    if (f.deployment && r.deployment !== f.deployment) return false;
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
function pickPrice(rows) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const d = (b.effectiveDate || "").localeCompare(a.effectiveDate || "");
    if (d !== 0) return d;
    return a.price - b.price;
  });
  const best = sorted[0];
  const prices = [...new Set(rows.map((r) => r.pricePer1M ?? r.price))];
  return {
    price: best.pricePer1M ?? best.price,
    unit: best.unit,
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

// Comparison matrix: rows = models, columns = deployment types, each cell holds
// Input/Output/Cached prices per 1M tokens. Token category only.
export function buildMatrix(records) {
  const tokenRows = records.filter((r) => r.category === "Tokens" && r.pricePer1M != null);
  const deployments = orderDeployments(uniqueSorted(tokenRows, "deployment"));

  const tree = new Map();
  for (const r of tokenRows) {
    const modelKey = `${r.provider}||${r.model}`;
    if (!tree.has(modelKey)) tree.set(modelKey, { provider: r.provider, model: r.model, deps: new Map() });
    const node = tree.get(modelKey);
    if (!node.deps.has(r.deployment)) node.deps.set(r.deployment, new Map());
    const depNode = node.deps.get(r.deployment);
    if (!depNode.has(r.direction)) depNode.set(r.direction, []);
    depNode.get(r.direction).push(r);
  }

  const rows = [];
  for (const [, node] of tree) {
    const cells = {};
    for (const [dep, dirMap] of node.deps) {
      cells[dep] = {};
      for (const dir of dirMap.keys()) cells[dep][dir] = pickPrice(dirMap.get(dir));
    }
    rows.push({ provider: node.provider, model: node.model, cells });
  }
  rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  return { rows, deployments };
}

// Collapse to one price per model+deployment+direction within (filtered) rows.
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
