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

function scopeOf(s) {
  if (/\bdata zone\b|\bdatazone\b|\bdzone\b|\bdzn\b|\bdz\b/.test(s)) return "Data Zone";
  if (/\bglobal\b|\bglbl\b|\bgl\b/.test(s)) return "Global";
  if (/\bregional\b|\bregnl\b|\brgnl\b|\bregn\b|\breg\b|\brgn\b/.test(s)) return "Regional";
  return null;
}

function deployment(sku) {
  const s = " " + sku.toLowerCase() + " ";
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
  const s = " " + s0.toLowerCase() + " ";
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

function modelName(productName, sku) {
  let m = sku;
  m = m.replace(/^FW\s+/i, "").replace(/^Mngd\s+/i, "");
  for (const re of STRIP) m = m.replace(re, " ");
  m = m.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!m) m = productName.replace(/^Azure\s+/i, "").replace(/\s+Models$/i, "");
  return m;
}

function category(unit, meterName) {
  const m = meterName.toLowerCase();
  if (/token/.test(m) || unit === "1M" || unit === "1K") return "Tokens";
  if (/image|megapixel/.test(m)) return "Images";
  if (/page/.test(m)) return "Pages";
  if (/search/.test(m)) return "Search";
  if (/session/.test(m)) return "Session";
  if (/call/.test(m)) return "Calls";
  if (/hour|second|day|month/.test(unit.toLowerCase())) return "Hosting";
  if (/unit/.test(m)) return "Hosting";
  return "Other";
}

function pricePer1M(price, unit) {
  if (unit === "1M") return price;
  if (unit === "1K") return price * 1000;
  return price;
}

export function normalize(row) {
  const prov = provider(row.productName);
  const dep = deployment(row.skuName);
  const dir = direction(row.skuName + " " + row.meterName);
  const cat = category(row.unitOfMeasure, row.meterName);
  const model = modelName(row.productName, row.skuName);
  const tokenUnit = row.unitOfMeasure === "1M" || row.unitOfMeasure === "1K";
  return {
    provider: prov,
    productName: row.productName,
    model,
    deployment: dep,
    direction: dir,
    category: cat,
    region: row.armRegionName || "",
    location: row.location || "",
    unit: row.unitOfMeasure,
    price: row.retailPrice,
    pricePer1M: cat === "Tokens" && tokenUnit ? pricePer1M(row.retailPrice, row.unitOfMeasure) : null,
    lowConfidence: dep === "Standard" && dir === "Flat",
    type: row.type,
    meterName: row.meterName,
    skuName: row.skuName,
    effectiveDate: row.effectiveStartDate,
  };
}

export const _internals = { provider, deployment, direction, modelName, category, scopeOf };
