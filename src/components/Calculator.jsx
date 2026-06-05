import { useMemo, useState } from "react";
import { buildModelPricing, buildUnitPricing, fmtUSD, fmtNum } from "../lib/data.js";

function num(v) {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const HOURS_PER_MONTH = 730;

function TokenCalculator({ records }) {
  const [inM, setInM] = useState("10");
  const [outM, setOutM] = useState("2");
  const [cachedM, setCachedM] = useState("0");
  const inputM = num(inM), outputM = num(outM), cachedMv = num(cachedM);

  const results = useMemo(() => {
    const pricing = buildModelPricing(records);
    const rows = pricing.map((m) => {
      const inP = m.prices.Input?.price;
      const outP = m.prices.Output?.price;
      const cachedP = m.prices["Cached Input"]?.price;
      const warnings = [];
      let cost = 0, complete = true;
      if (inputM > 0) { if (inP == null) { warnings.push("no input price"); complete = false; } else cost += inputM * inP; }
      if (outputM > 0) { if (outP == null) { warnings.push("no output price"); complete = false; } else cost += outputM * outP; }
      if (cachedMv > 0) { if (cachedP == null) { warnings.push("no cached price"); complete = false; } else cost += cachedMv * cachedP; }
      return {
        key: `${m.provider}|${m.model}|${m.deployment}`,
        provider: m.provider, model: m.model, deployment: m.deployment,
        lowConfidence: m.lowConfidence, inP, outP, cachedP, cost, complete, warnings,
      };
    });
    const usable = rows.filter((r) => r.cost > 0 || inputM + outputM + cachedMv === 0);
    usable.sort((a, b) => a.cost - b.cost);
    return usable;
  }, [records, inputM, outputM, cachedMv]);

  return (
    <>
      <p className="table-hint">
        Per-token billing. Enter expected <strong>monthly</strong> usage in millions of tokens.
        Costs respect the current filters, so narrow them first. Ranked cheapest-first.
      </p>
      <div className="calc-inputs">
        <label className="filter"><span>Input (M tokens/mo)</span>
          <input data-testid="calc-input" type="number" min="0" value={inM} onChange={(e) => setInM(e.target.value)} /></label>
        <label className="filter"><span>Output (M tokens/mo)</span>
          <input data-testid="calc-output" type="number" min="0" value={outM} onChange={(e) => setOutM(e.target.value)} /></label>
        <label className="filter"><span>Cached input (M tokens/mo)</span>
          <input data-testid="calc-cached" type="number" min="0" value={cachedM} onChange={(e) => setCachedM(e.target.value)} /></label>
      </div>
      <div className="table-wrap">
        <table className="pt" data-testid="calc-table">
          <thead><tr>
            <th>#</th><th>Provider</th><th>Model</th><th>Deployment</th>
            <th>Input $/1M</th><th>Output $/1M</th><th>Cached $/1M</th><th>Est. monthly cost</th>
          </tr></thead>
          <tbody>
            {results.slice(0, 300).map((r, i) => (
              <tr key={r.key} className={r.complete ? "" : "partial"}>
                <td>{i + 1}</td><td>{r.provider}</td>
                <td>{r.model}{r.lowConfidence ? " ⚠️" : ""}</td><td>{r.deployment}</td>
                <td>{fmtUSD(r.inP)}</td><td>{fmtUSD(r.outP)}</td><td>{fmtUSD(r.cachedP)}</td>
                <td className="calc-cost" data-testid="calc-cost">
                  {fmtUSD(r.cost, 2)}
                  {!r.complete && <span className="warn" title={r.warnings.join(", ")}> (partial)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length > 300 && <p className="empty-note">Showing cheapest 300 of {fmtNum(results.length)} — narrow filters to see more.</p>}
        {results.length === 0 && <p className="empty-note">No token-priced models match the current filters.</p>}
      </div>
    </>
  );
}

function UnitCalculator({ records, category }) {
  const [qty, setQty] = useState("1");
  const [hours, setHours] = useState(String(HOURS_PER_MONTH));
  const q = num(qty), hrs = num(hours);

  const { rows, anyHourly } = useMemo(() => {
    const priced = buildUnitPricing(records, category);
    const anyHourly = priced.some((r) => r.isHourly && !r.term);
    const out = priced.map((r) => {
      // Term reservations are a committed price per unit for the whole term — do
      // not multiply by hours. Hourly pay-go = units × hours × price. Other = units × price.
      let cost, basis;
      if (r.term) { cost = q * r.price; basis = `per ${r.term}`; }
      else if (r.isHourly) { cost = q * hrs * r.price; basis = `${fmtNum(hrs)} h/mo`; }
      else { cost = q * r.price; basis = "per month"; }
      return { ...r, key: `${r.provider}|${r.model}|${r.deployment}|${r.measure}|${r.term || ""}`, cost, basis };
    });
    out.sort((a, b) => a.cost - b.cost);
    return { rows: out, anyHourly };
  }, [records, category, q, hrs]);

  return (
    <>
      <p className="table-hint">
        <strong>{category}</strong> billing (non-token). Enter how many units you consume per
        month; costs respect the current filters and are ranked cheapest-first.
        {anyHourly && " Hourly meters (e.g. PTU/hr) are multiplied by hours per month."}
      </p>
      <div className="calc-inputs">
        <label className="filter"><span>Units / month</span>
          <input data-testid="calc-qty" type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        {anyHourly && (
          <label className="filter"><span>Hours / month (hourly meters)</span>
            <input data-testid="calc-hours" type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        )}
      </div>
      <div className="table-wrap">
        <table className="pt" data-testid="calc-table">
          <thead><tr>
            <th>#</th><th>Provider</th><th>Model</th><th>Deployment</th>
            <th>Measure</th><th>Unit price</th><th>Term</th><th>Est. monthly cost</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 300).map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td><td>{r.provider}</td><td>{r.model}</td><td>{r.deployment}</td>
                <td>{r.measure}</td>
                <td>{fmtUSD(r.price)}{r.varies ? "*" : ""}</td>
                <td>{r.term || "—"}</td>
                <td className="calc-cost" data-testid="calc-cost">
                  {fmtUSD(r.cost, 2)}
                  <span className="muted small"> {r.basis}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 300 && <p className="empty-note">Showing cheapest 300 of {fmtNum(rows.length)} — narrow filters to see more.</p>}
        {rows.length === 0 && <p className="empty-note">No {category} meters match the current filters.</p>}
      </div>
    </>
  );
}

export default function Calculator({ records, category }) {
  const tokenMode = !category || category === "Tokens";
  return (
    <div className="calc" data-testid="calculator">
      {tokenMode ? (
        <TokenCalculator records={records} />
      ) : (
        <UnitCalculator records={records} category={category} />
      )}
    </div>
  );
}
