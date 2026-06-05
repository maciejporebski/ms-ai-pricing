import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, _internals } from "./normalize.mjs";

const { deployment, direction, scopeOf, category } = _internals;

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
