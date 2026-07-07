// Heuristic normalizer for Azure Retail "Foundry Models" pricing rows.
// Exported so it can be reused by the fetch script and unit tests.

const PROVIDER_MAP = [
  [/^Azure OpenAI/i, "OpenAI"],
  [/^Azure Deepseek/i, "DeepSeek"],
  [/^Azure Grok/i, "xAI (Grok)"],
  [/^Azure Llama/i, "Meta (Llama)"],
  [/^Azure Mistral/i, "Mistral"],
  [/^Azure Phi/i, "Microsoft (Phi)"],
  [/^Azure BFL/i, "Black Forest Labs (Flux)"],
  [/^Azure Fireworks/i, "Fireworks"],
  [/^Azure Kimi/i, "Moonshot (Kimi)"],
  [/^Cohere/i, "Cohere"],
  [/^MAI Models/i, "Microsoft (MAI)"],
  [/^Qwen/i, "Alibaba (Qwen)"],
  [/^Managed Compute/i, "Managed Compute"],
  [/^Microsoft Agent/i, "Microsoft"],
  [/^Azure AI Foundry/i, "Azure Foundry"],
];

function provider(productName) {
  for (const [re, name] of PROVIDER_MAP) if (re.test(productName)) return name;
  return productName;
}

// Azure SKU names sometimes glue tokens together in camelCase
// (e.g. "BatchOutp", "realtimePrvwAudInp"), which defeats the \b-anchored
// keyword checks below. Split on lower→upper boundaries first so "Batch Outp",
// "Aud Inp" etc. tokenize correctly.
function splitCamel(s) {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function scopeOf(s) {
  if (/\bdata zone\b|\bdatazone\b|\bdzone\b|\bdzn\b|\bdz\b/.test(s)) return "Data Zone";
  if (/\bglobal\b|\bglbl\b|\bgl\b/.test(s)) return "Global";
  if (/\bregional\b|\bregnl\b|\brgnl\b|\bregn\b|\breg\b|\brgn\b/.test(s)) return "Regional";
  return null;
}

function deployment(sku) {
  const s = " " + splitCamel(sku).toLowerCase() + " ";
  const isBatch = /\bbatch\b/.test(s);
  const isProv = /provisioned|\bptu\b/.test(s);
  const isFt = /\bft\b|finetuned|fine-tuned|\brft\b/.test(s) && !/\bpp\b/.test(s);
  const scope = scopeOf(s);

  if (isProv) return "Provisioned" + (scope ? ` (${scope})` : "");
  if (isFt) return "Fine-tuning" + (scope ? ` (${scope})` : "");
  if (isBatch) return (scope ? scope + " " : "") + "Batch";
  if (scope) return scope;
  return "Standard";
}

function direction(s0) {
  const s = " " + splitCamel(s0).toLowerCase() + " ";
  const cached = /\bcd\b|\bcchd\b|cache|cached/.test(s);
  const input = /\binp\b|\binput\b|\binpt\b|-in-|\bin-ft\b|text input|\bin\b/.test(s);
  const output = /\boutp\b|\boutput\b|\bout\b|\boutpt\b|\bopt\b|-out-|\bout-ft\b/.test(s);
  if (cached) return "Cached Input";
  if (output) return "Output";
  if (input) return "Input";
  return "Flat";
}

const STRIP = [
  /\bprovisioned managed\b/gi, /\bdeployment hosting unit\b/gi, /\bhosting\b/gi,
  /\bdata zone\b/gi, /\bdatazone\b/gi, /\bdzone\b/gi, /\bdzn\b/gi, /\bdz\b/gi,
  /\bglobal\b/gi, /\bglbl\b/gi, /\bgl\b/gi,
  /\bregional\b/gi, /\bregnl\b/gi, /\brgnl\b/gi, /\bregn\b/gi, /\breg\b/gi, /\brgn\b/gi,
  /\bbatch\b/gi, /\bprovisioned\b/gi, /\bptu\b/gi,
  /\binp\b/gi, /\binput\b/gi, /\binpt\b/gi, /\boutp\b/gi, /\boutput\b/gi,
  /\bout\b/gi, /\boutpt\b/gi, /\bopt\b/gi, /\bin\b/gi,
  /\bcd\b/gi, /\bcchd\b/gi, /\bcached\b/gi, /\bcache\b/gi,
  /\bft\b/gi, /\brft\b/gi, /\bfinetuned\b/gi, /\bpp\b/gi,
  /\b1m\b/gi, /\btokens?\b/gi, /\bmodel\b/gi, /\bunit\b/gi,
  /-in-/gi, /-out-/gi, /\bmdl\b/gi, /\bgrdr\b/gi, /\bgrader\b/gi,
];

// Recognizable model family from the productName, used to salvage over-stripped
// SKU-derived names like "5" or "4.3". Drops Azure + packaging/company-only words
// but keeps brand/family tokens; the last remaining token is the family
// ("Azure OpenAI GPT5" -> "GPT", "Azure Grok Models" -> "Grok").
const PRODUCT_STRIP = /\b(azure|models?|reservation|provisioned|throughput|managed|compute|agent|foundry|microsoft|openai|pp|ft)\b/gi;
function familyFromProduct(productName) {
  const toks = productName.replace(PRODUCT_STRIP, " ").match(/[A-Za-z]{2,}/g) || [];
  const last = toks[toks.length - 1];
  return last ? last.match(/^[A-Za-z]+/)[0] : "";
}

function modelName(productName, sku) {
  let m = splitCamel(sku);
  m = m.replace(/^FW\s+/i, "").replace(/^Mngd\s+/i, "");
  for (const re of STRIP) m = m.replace(re, " ");
  m = m.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!m) {
    m = productName.replace(/^Azure\s+/i, "").replace(/\s+Models$/i, "");
  } else if (/^[\d.]+$/.test(m)) {
    // Bare number remnant (e.g. "5", "4.3"): prepend the family -> "GPT 5", "Grok 4.3".
    const fam = familyFromProduct(productName);
    if (fam && !new RegExp(`^${fam}\\b`, "i").test(m)) m = `${fam} ${m}`;
  }
  return m;
}

function category(unit, meterName, deployment) {
  const m = meterName.toLowerCase();
  const u = unit.toLowerCase();
  // PTU: provisioned throughput, billed per unit/hour or as a reservation.
  if (/provisioned (managed|throughput)|provisioned throughput|\bptu\b/.test(m) || /^provisioned/i.test(deployment))
    return "PTU";
  // Explicit per-token meters always carry "Token(s)" in the meter name.
  if (/token/.test(m)) return "Tokens";
  // Explicit unit nouns must win over the generic 1M/1K token fallback below
  // (e.g. Doc AI "Pages" is billed per 1K pages, Speech per 1M characters).
  if (/image|megapixel/.test(m)) return "Images";
  if (/\bpage/.test(m)) return "Pages";
  if (/character/.test(m)) return "Characters";
  if (/search|\bgb\b/.test(m)) return "Search";
  if (/session/.test(m)) return "Session";
  if (/\bcall/.test(m)) return "Calls";
  if (/\bsecond\b/.test(m)) return "Other";
  // Fallback: a bare 1M/1K meter with no other noun is token-like.
  if (u === "1m" || u === "1k") return "Tokens";
  if (/hour|second|day|month/.test(u) || /\bunit\b|hosting/.test(m)) return "Hosting";
  return "Other";
}

function pricePer1M(price, unit) {
  if (unit === "1M") return price;
  if (unit === "1K") return price * 1000;
  return price;
}

// Friendly billing-unit noun, derived from the meter name's trailing word and
// the unit-of-measure. Drives non-token price display (e.g. "/PTU-hr", "/image").
function measureLabel(unit, meterName, category) {
  const u = unit.toLowerCase();
  const last = (meterName.trim().split(/\s+/).pop() || "").replace(/[^A-Za-z]/g, "");
  if (category === "Tokens") return "1M tokens";
  if (category === "PTU") {
    if (u.includes("hour")) return "PTU/hr";
    if (u.includes("month")) return "PTU/mo";
    return "PTU";
  }
  if (category === "Pages") return u === "1k" ? "1K pages" : u === "1m" ? "1M pages" : "page";
  if (category === "Characters") return u === "1k" ? "1K chars" : u === "1m" ? "1M chars" : "char";
  if (/megapixel/i.test(meterName)) return u === "100" ? "100 MP" : "megapixel";
  if (/image/i.test(meterName)) return "image";
  if (/\bsearch\b|\bGB\b/i.test(meterName)) return u.includes("day") ? "GB/day" : "GB";
  if (/session/i.test(meterName)) return "session";
  if (/\bcall/i.test(meterName)) return "call";
  if (/second/i.test(meterName)) return "second";
  if (u.includes("hour")) return last ? `${last}/hr` : "unit/hr";
  if (u.includes("month")) return "unit/mo";
  if (u.includes("day")) return "unit/day";
  return last || "unit";
}

export function normalize(row) {
  const prov = provider(row.productName);
  const dep = deployment(row.skuName);
  const dir = direction(row.skuName + " " + row.meterName);
  const cat = category(row.unitOfMeasure, row.meterName, dep);
  // PTU (provisioned throughput) is billed per PTU and is NOT model-specific — the
  // API exposes one generic meter per provider/region. Label it so accordingly.
  const model = cat === "PTU" ? "All models" : modelName(row.productName, row.skuName);
  const tokenUnit = row.unitOfMeasure === "1M" || row.unitOfMeasure === "1K";
  const isHourly = /hour/i.test(row.unitOfMeasure);
  return {
    provider: prov,
    productName: row.productName,
    model,
    deployment: dep,
    direction: dir,
    category: cat,
    measure: measureLabel(row.unitOfMeasure, row.meterName, cat),
    region: row.armRegionName || "",
    location: row.location || "",
    unit: row.unitOfMeasure,
    isHourly,
    price: row.retailPrice,
    pricePer1M: cat === "Tokens" && tokenUnit ? pricePer1M(row.retailPrice, row.unitOfMeasure) : null,
    lowConfidence: dep === "Standard" && dir === "Flat" && cat === "Tokens",
    type: row.type,
    term: row.reservationTerm || null,
    meterName: row.meterName,
    skuName: row.skuName,
    effectiveDate: row.effectiveStartDate,
  };
}

export const _internals = { provider, deployment, direction, modelName, category, scopeOf, measureLabel };
