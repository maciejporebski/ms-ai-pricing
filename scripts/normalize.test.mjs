import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, _internals } from "./normalize.mjs";

const { deployment, direction, scopeOf, category, modelName } = _internals;

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
