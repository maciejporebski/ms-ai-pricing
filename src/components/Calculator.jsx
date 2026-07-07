import { useMemo, useState } from "react";
import {
  uniqueSorted, buildRegionCalcData, calcDeploymentsFor, calcPricing, calcRowTotal, calcTokenCosts,
  fmtUSD,
} from "../lib/data.js";
import { UNIVERSAL_REGIONS, regionName } from "../lib/regions.js";
import { Combobox } from "./Filters.jsx";

let rowUid = 0;
function newRow() {
  return {
    id: ++rowUid,
    region: "", model: "", deployment: "",
    inTokens: "", outTokens: "", cachedTokens: "",
    ptus: "", hours: "730",
  };
}

const num = (s) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function NumberField({ label, hint, cost, value, onChange, disabled }) {
  return (
    <label className={`filter calc-num${disabled ? " disabled" : ""}`}>
      <span>{label}</span>
      <input
        type="number" min="0" step="any" inputMode="decimal"
        value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
      {hint && <span className="calc-rate">{hint}</span>}
      {!disabled && cost != null && <span className="calc-cost">{fmtUSD(cost)}</span>}
    </label>
  );
}

function CalcRow({ record, regionData, regions, regionLabels, onChange, onRemove, canRemove }) {
  const modelOptions = regionData ? regionData.models.map((m) => m.key) : [];
  const modelLabels = useMemo(() => {
    const map = new Map();
    if (regionData) for (const m of regionData.models) map.set(m.key, `${m.provider} — ${m.model}`);
    return map;
  }, [regionData]);

  const deployments = useMemo(
    () => calcDeploymentsFor(regionData, record.model),
    [regionData, record.model]
  );
  const depLabels = useMemo(() => {
    const map = new Map();
    if (regionData && record.model) {
      const tokenSet = regionData.tokenDeps.get(record.model) || new Set();
      for (const d of deployments) map.set(d, tokenSet.has(d) ? d : `${d} · PTU`);
    }
    return map;
  }, [regionData, record.model, deployments]);

  const pricing = useMemo(
    () => calcPricing(regionData, record.model, record.deployment),
    [regionData, record.model, record.deployment]
  );

  const inputs = {
    inTokens: num(record.inTokens), outTokens: num(record.outTokens),
    cachedTokens: num(record.cachedTokens), ptus: num(record.ptus), hours: num(record.hours),
  };
  const total = calcRowTotal(pricing, inputs);

  const isTokens = pricing?.mode === "tokens";
  const isPtu = pricing?.mode === "ptu";
  const rate = (dir) => {
    const p = pricing?.prices?.[dir];
    return p ? `${fmtUSD(p.price)} /1M` : "—";
  };
  const tokenCosts = isTokens ? calcTokenCosts(pricing, inputs) : [];
  const costOf = (dir) => (tokenCosts.find((c) => c.dir === dir)?.cost ?? null);
  const ptuCost = isPtu
    ? inputs.ptus * pricing.ptu.price * (pricing.ptu.isHourly ? inputs.hours : 1)
    : null;

  return (
    <div className="calc-row" data-testid="calc-row">
      <div className="calc-selectors">
        <Combobox label="Location" value={record.region} options={regions} labels={regionLabels}
          placeholder="Select region…"
          onChange={(v) => onChange({ region: v, model: "", deployment: "" })} />
        <Combobox label="Model" value={record.model} options={modelOptions} labels={modelLabels}
          placeholder={record.region ? "Select model…" : "Pick a region first"}
          onChange={(v) => onChange({ model: v, deployment: "" })} />
        <Combobox label="Hosting type" value={record.deployment} options={deployments} labels={depLabels}
          className="calc-cb-hosting"
          placeholder={record.model ? "Select hosting…" : "Pick a model first"}
          onChange={(v) => onChange({ deployment: v })} />
      </div>

      <div className="calc-inputs">
        <NumberField label="Input (M tokens)" hint={isTokens ? rate("Input") : null} cost={costOf("Input")}
          value={record.inTokens} disabled={!isTokens}
          onChange={(v) => onChange({ inTokens: v })} />
        <NumberField label="Output (M tokens)" hint={isTokens ? rate("Output") : null} cost={costOf("Output")}
          value={record.outTokens} disabled={!isTokens}
          onChange={(v) => onChange({ outTokens: v })} />
        <NumberField label="Cached (M tokens)" hint={isTokens ? rate("Cached Input") : null} cost={costOf("Cached Input")}
          value={record.cachedTokens} disabled={!isTokens}
          onChange={(v) => onChange({ cachedTokens: v })} />
        <NumberField label="PTUs" hint={isPtu ? `${fmtUSD(pricing.ptu.price)} /${pricing.ptu.measure}` : null} cost={ptuCost}
          value={record.ptus} disabled={!isPtu}
          onChange={(v) => onChange({ ptus: v })} />
        <NumberField label="Hours" hint={isPtu && pricing.ptu.isHourly ? "per month ≈ 730" : null}
          value={record.hours} disabled={!isPtu || !pricing?.ptu?.isHourly}
          onChange={(v) => onChange({ hours: v })} />
      </div>

      <div className="calc-result">
        <div className="calc-total" data-testid="calc-total">
          <span className="muted small">Estimated cost</span>
          <strong>{total == null ? "—" : fmtUSD(total, 2)}</strong>
        </div>
        <button type="button" className="calc-remove" onClick={onRemove}
          disabled={!canRemove} aria-label="Remove row">✕</button>
      </div>
    </div>
  );
}

export default function Calculator({ records, regionLabels }) {
  const [rows, setRows] = useState(() => [newRow()]);

  const regions = useMemo(
    () => uniqueSorted(records, "region")
      .filter((r) => !UNIVERSAL_REGIONS.has(r))
      .sort((a, b) => regionName(a).localeCompare(regionName(b))),
    [records]
  );

  // Per-region pricing data, computed on demand and memoized by region.
  const getRegionData = useMemo(() => {
    const cache = new Map();
    return (region) => {
      if (!region) return null;
      if (!cache.has(region)) cache.set(region, buildRegionCalcData(records, region));
      return cache.get(region);
    };
  }, [records]);

  const update = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  const grandTotal = rows.reduce((sum, r) => {
    const rd = getRegionData(r.region);
    const pricing = calcPricing(rd, r.model, r.deployment);
    const t = calcRowTotal(pricing, {
      inTokens: num(r.inTokens), outTokens: num(r.outTokens), cachedTokens: num(r.cachedTokens),
      ptus: num(r.ptus), hours: num(r.hours),
    });
    return sum + (t || 0);
  }, 0);

  return (
    <section className="calculator" data-testid="calculator">
      <p className="table-hint">
        Estimate and compare costs across model deployments. Enter token counts in
        <strong> millions</strong> (1 = 1M tokens); PTU (provisioned) costs are the provider
        hourly rate × units × hours. Retail USD only — excludes discounts, reservations, and taxes.
      </p>

      <div className="calc-rows">
        {rows.map((r) => (
          <CalcRow
            key={r.id}
            record={r}
            regionData={getRegionData(r.region)}
            regions={regions}
            regionLabels={regionLabels}
            canRemove={rows.length > 1}
            onChange={(patch) => update(r.id, patch)}
            onRemove={() => removeRow(r.id)}
          />
        ))}
      </div>

      <div className="calc-foot">
        <button type="button" className="btn" onClick={addRow} data-testid="calc-add-row">
          + Add row
        </button>
        <div className="calc-grand" data-testid="calc-grand-total">
          <span className="muted">Total (all rows)</span>
          <strong>{fmtUSD(grandTotal, 2)}</strong>
        </div>
      </div>
    </section>
  );
}
