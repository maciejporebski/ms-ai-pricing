import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, _internals } from "./normalize.mjs";
import { buildCategoryMatrix, buildRegionCalcData, calcPricing, calcRowTotal } from "../src/lib/data.js";

const { deployment, direction, scopeOf, category, modelName, priorityProcessing } = _internals;

function row(o) {
  return {
    productName: "Azure OpenAI GPT5",
    skuName: "5.4 opt Dz",
    meterName: "5.4 opt Dz 1M Tokens",
    armRegionName: "eastus2",
    location: "US East 2",
    unitOfMeasure: "1M",
    retailPrice: 16.5,
    type: "Consumption",
    effectiveStartDate: "2026-03-01T00:00:00Z",
    ...o,
  };
}

test("provider mapping from productName", () => {
  assert.equal(normalize(row()).provider, "OpenAI");
  assert.equal(normalize(row({ productName: "Azure Grok Models" })).provider, "xAI (Grok)");
  assert.equal(normalize(row({ productName: "Cohere Models" })).provider, "Cohere");
  assert.equal(normalize(row({ productName: "Azure Llama Models" })).provider, "Meta (Llama)");
});

test("deployment scope detection", () => {
  assert.equal(deployment("5.4 opt Dz"), "Data Zone");
  assert.equal(deployment("GPT 5 outpt Glbl"), "Global");
  assert.equal(deployment("gpt 4.1 Inp regnl"), "Regional");
  assert.equal(deployment("Provisioned Managed Global"), "Provisioned (Global)");
  assert.equal(deployment("5.4 pro Batch inp Dz"), "Data Zone Batch");
  assert.equal(deployment("41 ft opt Dz"), "Fine-tuning (Data Zone)");
  assert.equal(deployment("Phi-4-reasoning-Output"), "Standard");
});

test("direction detection incl cached", () => {
  assert.equal(direction("5.4 opt Dz"), "Output");
  assert.equal(direction("gpt 4.1 Inp regnl"), "Input");
  assert.equal(direction("5.4 nano Batch cd Inp Gl"), "Cached Input");
  assert.equal(direction("gpt rt aud 0828 cchd Inp glbl"), "Cached Input");
  assert.equal(direction("text embedding 3 large DZ"), "Flat");
});

test("glued camelCase tokens are detected (BatchOutp, AudInp, TxtOutp)", () => {
  assert.equal(direction("gpt 4o mini0718 BatchOutp DataZone"), "Output");
  assert.equal(direction("gpt4o realtimePrvwAudInp DataZone"), "Input");
  assert.equal(direction("gpt4o realtimePrvwTxtOutp DataZone"), "Output");
  // deployment must still see the glued "Batch"
  assert.equal(deployment("gpt 4o mini0718 BatchOutp DataZone"), "Data Zone Batch");
});

test("over-stripped names get the model family prefixed", () => {
  assert.equal(modelName("Azure OpenAI GPT5", "5 pp inp Dz"), "GPT 5");
  assert.equal(modelName("Azure OpenAI PP FT GPT4s", "41 ft opt Dz"), "GPT 41");
  assert.equal(modelName("Azure OpenAI GPT5", "5.4 opt Dz"), "GPT 5.4");
  assert.equal(modelName("Azure Grok Models", "4.3 Inp DZ"), "Grok 4.3");
  // names that already carry letters are left as-is
  assert.equal(modelName("Azure Deepseek Models", "V3 Inp Gl"), "V3");
  assert.equal(modelName("Azure OpenAI", "o1 opt Dz"), "o1");
  assert.equal(modelName("Azure Deepseek Models", "R1 Inp glbl"), "R1");
});

test("version-led variants are prefixed consistently with the base model", () => {
  // The bug the user reported: "5.4 mini" vs "GPT 5.4" under the same product.
  assert.equal(modelName("Azure OpenAI GPT5", "5.4 mini cd Inp Gl"), "GPT 5.4 mini");
  assert.equal(modelName("Azure OpenAI GPT5", "5 mini pp Inp Gl"), "GPT 5 mini");
  assert.equal(modelName("Azure OpenAI PP FT GPT4s", "4o 0806"), "GPT 4o 0806");
  // Literal lowercase "gpt" is canonicalized to "GPT".
  assert.equal(modelName("Azure OpenAI", "gpt-4.1-mini-ft mdl opt"), "GPT 4.1 mini");
  assert.equal(modelName("Azure OpenAI", "gpt 5 codex"), "GPT 5 codex");
  // Non-GPT families under ambiguous products are NOT mislabeled.
  assert.equal(modelName("Azure OpenAI OSS Models", "20b inp Gl"), "20b");
  assert.equal(modelName("Azure OpenAI Reasoning", "o4 mini inp Gl"), "o4 mini");
});

test("priority processing (pp) meters are flagged, standard meters are not", () => {
  assert.equal(priorityProcessing("5 mini pp Inp Gl"), true);
  assert.equal(priorityProcessing("5 pp cd inp Gl"), true);
  assert.equal(priorityProcessing("5.4 opt Dz"), false);
  assert.equal(priorityProcessing("gpt 4.1 Inp regnl"), false);
  assert.equal(normalize(row({ skuName: "5 mini pp Inp Gl" })).priorityProcessing, true);
  assert.equal(normalize(row({ skuName: "5.4 opt Dz" })).priorityProcessing, false);
});

test("newer GPT families have consistent context-tier names across billing meters", () => {
  const families = [
    ["Azure OpenAI GPT5", "5.6 terra", "GPT 5.6 terra"],
    ["Azure OpenAI GPT5", "5.6 luna", "GPT 5.6 luna"],
    ["Azure OpenAI GPT5", "5.6 sol", "GPT 5.6 sol"],
    ["Azure OpenAI GPT6", "6-astra", "GPT 6 astra"],
    ["Azure OpenAI GPT6", "6-luna", "GPT 6 luna"],
    ["Azure OpenAI GPT6", "6-sol", "GPT 6 sol"],
    ["Azure OpenAI GPT6", "6.1-sol", "GPT 6.1 sol"],
  ];
  const billing = [
    ["Inp", "Input"], ["Opt", "Output"],
    ["Cd Inp", "Cached Input"], ["Cd Wr", "Cache Write"],
  ];
  for (const [productName, prefix, expected] of families) {
    for (const [context, tier] of [["ShortCo", "short"], ["LongCo", "long"]]) {
      for (const [billingToken, dir] of billing) {
        for (const processing of ["Std", "PP"]) {
          for (const [scope, dep] of [["Gl", "Global"], ["DZ", "Data Zone"]]) {
            const skuName = `${prefix} ${context} ${billingToken} ${processing} ${scope}`;
            const r = normalize(row({ productName, skuName, meterName: `${skuName} 1M Tokens` }));
            assert.equal(r.model, `${expected} (${tier} context)`, skuName);
            assert.equal(r.direction, dir, skuName);
            assert.equal(r.deployment, dep, skuName);
            assert.equal(r.priorityProcessing, processing === "PP", skuName);
            assert.equal(r.category, "Tokens");
            assert.equal(r.lowConfidence, false);
            assert.equal(r.skuName, skuName);
          }
        }
      }
    }
  }
  assert.equal(modelName("Azure OpenAI GPT6", "gpt-6.1-sol-longco-cd-wr-std-gl"),
    "GPT 6.1 sol (long context)");
  assert.equal(modelName("Azure OpenAI GPT6", "GPT 6.1 sol Short Co Inp Std Gl"),
    "GPT 6.1 sol (short context)");
  // "Std" is a meaningful image quality variant, not a GPT serving tier.
  assert.equal(modelName("Azure OpenAI Media", "Image Dall-E 3 Std Low Res"),
    "Image Dall E 3 Std Low Res");
});

test("compact GPT 5.6 Flex meters retain context and serving-tier price distinctions", () => {
  for (const variant of ["terra", "luna", "sol"]) {
    for (const [context, tier] of [["ShCo", "short"], ["LoCo", "long"]]) {
      for (const billing of ["Inp", "Opt", "Cd Inp", "Cd Wr"]) {
        const skuName = `56${variant} ${context} ${billing} Fl Gl`;
        const r = normalize(row({ skuName, meterName: `${skuName} 1M Tokens` }));
        assert.equal(r.model, `GPT 5.6 ${variant} (${tier} context) Flex`);
        assert.notEqual(r.model, modelName("Azure OpenAI GPT5", `5.6 ${variant} ${context} ${billing} Std Gl`));
        assert.equal(r.direction, direction(billing));
        assert.equal(r.deployment, "Global");
      }
    }
  }
});

test("cache-write meters do not collapse into cached-input prices after name normalization", () => {
  const records = [];
  for (const [context, multiplier] of [["ShortCo", 1], ["LongCo", 2]]) {
    for (const [billing, price] of [["Inp", 2], ["Opt", 10], ["Cd Inp", 0.1], ["Cd Wr", 2.5]]) {
      for (const processing of ["Std", "PP"]) {
        const skuName = `6.1-sol ${context} ${billing} ${processing} Gl`;
        records.push(normalize(row({
          productName: "Azure OpenAI GPT6", skuName, meterName: `${skuName} 1M Tokens`,
          retailPrice: price * multiplier * (processing === "PP" ? 2 : 1),
        })));
      }
    }
  }
  const matrix = buildCategoryMatrix(records, "Tokens");
  assert.equal(matrix.rows.length, 2);
  const short = matrix.rows.find((r) => r.model === "GPT 6.1 sol (short context)");
  assert.deepEqual(short.cells.Global.map((c) => [c.key, c.p.price, c.pp.price]), [
    ["Input", 2, 4], ["Output", 10, 20], ["Cached Input", 0.1, 0.2], ["Cache Write", 2.5, 5],
  ]);

  const regionData = buildRegionCalcData(records, "eastus2");
  const inputs = { inTokens: 1, outTokens: 1, cachedTokens: 1, cacheWriteTokens: 1 };
  for (const [tier, multiplier] of [["short", 1], ["long", 2]]) {
    const key = `OpenAI||GPT 6.1 sol (${tier} context)`;
    const pricing = calcPricing(regionData, key, "Global");
    assert.equal(calcRowTotal(pricing, inputs), 14.6 * multiplier);
    assert.equal(calcRowTotal(calcPricing(regionData, key, "Global", true), inputs), 29.2 * multiplier);
    assert.equal(calcRowTotal(pricing, { cachedTokens: 1 }), 0.1 * multiplier);
  }
});

test("scopeOf one-word datazone and regn", () => {
  assert.equal(scopeOf(" computer-use-outp-datazone "), "Data Zone");
  assert.equal(scopeOf(" gpt4o realtime cached audio inp regn "), "Regional");
});

test("token unit normalization to per 1M", () => {
  assert.equal(normalize(row({ unitOfMeasure: "1M", retailPrice: 16.5 })).pricePer1M, 16.5);
  const k = normalize(row({ unitOfMeasure: "1K", retailPrice: 0.002, meterName: "x 1K Tokens" }));
  assert.equal(k.pricePer1M, 2);
});

test("non-token meters get null pricePer1M and proper category", () => {
  const img = normalize(row({
    productName: "Azure BFL Flux Models", skuName: "Flux 1.1 Pro glbl",
    meterName: "Flux 1.1 Pro glbl Images", unitOfMeasure: "1", retailPrice: 0.04,
  }));
  assert.equal(img.category, "Images");
  assert.equal(img.pricePer1M, null);

  const sess = normalize(row({
    productName: "Azure OpenAI", skuName: "Code-Interpreter-global",
    meterName: "Code-Interpreter-global Session", unitOfMeasure: "1", retailPrice: 0.03,
  }));
  assert.equal(sess.category, "Session");
  assert.equal(sess.pricePer1M, null);
});

test("hosting/unit meters categorized as Hosting", () => {
  const h = normalize(row({
    productName: "Azure Llama Models", skuName: "3.3 70b FT",
    meterName: "3.3 70b FT Deployment Hosting Unit", unitOfMeasure: "1/Hour", retailPrice: 5,
  }));
  assert.equal(h.category, "Hosting");
});

test("category prefers token when meter says Tokens even with unit 1", () => {
  assert.equal(category("1M", "5.4 opt Dz 1M Tokens"), "Tokens");
  assert.equal(category("1", "some Tokens"), "Tokens");
});

test("lowConfidence flag only when both deployment Standard and direction Flat", () => {
  const lc = normalize(row({
    productName: "Azure OpenAI Embedding", skuName: "text embedding 3 large DZ",
    meterName: "text embedding 3 large DZ Tokens",
  }));
  // has DZ scope -> not low confidence
  assert.equal(lc.lowConfidence, false);
  const amb = normalize(row({
    productName: "Azure OpenAI Free Meter", skuName: "Standard",
    meterName: "Standard Unit", unitOfMeasure: "1", retailPrice: 0,
  }));
  assert.equal(amb.deployment, "Standard");
});

test("PTU consumption: category PTU, hourly measure, no term", () => {
  const r = normalize(row({
    productName: "Azure Llama Models", skuName: "Provisioned Managed Data Zone",
    meterName: "Provisioned Managed Data Zone Unit", unitOfMeasure: "1/Hour",
    retailPrice: 1.1, type: "Consumption", reservationTerm: undefined,
  }));
  assert.equal(r.category, "PTU");
  assert.equal(r.measure, "PTU/hr");
  assert.equal(r.isHourly, true);
  assert.equal(r.term, null);
  assert.equal(r.pricePer1M, null);
});

test("PTU reservation: kept, with term and type", () => {
  const r = normalize(row({
    productName: "Azure AI Foundry Provisioned Throughput Reservation",
    skuName: "Provisioned Managed Regional", meterName: "Provisioned Managed Regional Unit",
    unitOfMeasure: "1/Hour", retailPrice: 2916, type: "Reservation", reservationTerm: "1 Year",
  }));
  assert.equal(r.category, "PTU");
  assert.equal(r.type, "Reservation");
  assert.equal(r.term, "1 Year");
});

test("Doc AI pages: category Pages billed per 1K, not tokens", () => {
  const r = normalize(row({
    productName: "Azure Mistral Models", skuName: "Doc AI glbl 2505",
    meterName: "Doc AI glbl 2505 Pages", unitOfMeasure: "1K", retailPrice: 3.3,
  }));
  assert.equal(r.category, "Pages");
  assert.equal(r.measure, "1K pages");
  assert.equal(r.pricePer1M, null);
  assert.equal(r.price, 3.3);
});

test("Speech characters: category Characters, not tokens", () => {
  const r = normalize(row({
    productName: "Azure OpenAI Media", skuName: "Speech-Text to Speech-global",
    meterName: "Speech-Text to Speech-global Characters", unitOfMeasure: "1M", retailPrice: 15,
  }));
  assert.equal(r.category, "Characters");
  assert.equal(r.measure, "1M chars");
  assert.equal(r.pricePer1M, null);
});

test("measureLabel covers key billing units", () => {
  assert.equal(_internals.measureLabel("1/Hour", "Provisioned Managed Global Unit", "PTU"), "PTU/hr");
  assert.equal(_internals.measureLabel("1/Month", "x Unit", "PTU"), "PTU/mo");
  assert.equal(_internals.measureLabel("1", "Flex Megapixel", "Images"), "megapixel");
  assert.equal(_internals.measureLabel("1", "Code-Interpreter-global Session", "Session"), "session");
  assert.equal(_internals.measureLabel("1/Day", "Assistants-File Search-glbl GB", "Search"), "GB/day");
});
